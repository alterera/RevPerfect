import express from 'express';
import { hotelService } from '../services/hotel.service.js';
import { snapshotService } from '../services/snapshot.service.js';
import { prisma } from '../utils/prisma.js';

const router = express.Router();

// Enable JSON parsing
router.use(express.json());

/**
 * GET /api/hotels
 * Get all active hotels
 */
router.get('/hotels', async (_req, res) => {
  try {
    const hotels = await hotelService.getAllActiveHotels();
    res.json(hotels);
  } catch (error) {
    console.error('Error fetching hotels:', error);
    res.status(500).json({ error: 'Failed to fetch hotels' });
  }
});

/**
 * GET /api/hotels/:hotelId/snapshots
 * Get all snapshots for a hotel
 */
router.get('/hotels/:hotelId/snapshots', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const snapshots = await snapshotService.getSnapshotsByHotel(hotelId, limit);
    res.json(snapshots);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

/**
 * GET /api/pickup/:hotelId
 * Compare two snapshots and return pickup data
 * Query params: snapshot1Id, snapshot2Id (optional - defaults to latest two)
 */
router.get('/pickup/:hotelId', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { snapshot1Id, snapshot2Id } = req.query;

    let snapshot1: any;
    let snapshot2: any;

    // If snapshot IDs provided, use them; otherwise get latest two
    if (snapshot1Id && snapshot2Id) {
      snapshot1 = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshot1Id as string },
      });
      snapshot2 = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshot2Id as string },
      });
    } else {
      // Get latest two completed snapshots
      const snapshots = await prisma.historyForecastSnapshot.findMany({
        where: {
          hotelId,
          processed: true,
          processingStatus: 'COMPLETED',
        },
        orderBy: { snapshotTime: 'desc' },
        take: 2,
      });

      if (snapshots.length < 2) {
        return res.status(400).json({
          error: 'Need at least 2 completed snapshots to compare',
          availableSnapshots: snapshots.length,
        });
      }

      snapshot2 = snapshots[0]; // Latest
      snapshot1 = snapshots[1]; // Previous
    }

    if (!snapshot1 || !snapshot2) {
      return res.status(404).json({ error: 'One or both snapshots not found' });
    }

    // Ensure snapshot1 is older than snapshot2
    if (snapshot1.snapshotTime > snapshot2.snapshotTime) {
      [snapshot1, snapshot2] = [snapshot2, snapshot1];
    }

    // Get forecast data for both snapshots, grouped by month
    const data1 = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: snapshot1.id,
        dataType: 'FORECAST',
      },
      orderBy: { stayDate: 'asc' },
    });

    const data2 = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: snapshot2.id,
        dataType: 'FORECAST',
      },
      orderBy: { stayDate: 'asc' },
    });

    // Group by month and calculate pickup
    const monthlyPickup: Record<string, any> = {};

    // Process snapshot1 (older)
    data1.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyPickup[monthKey]) {
        monthlyPickup[monthKey] = {
          month: monthKey,
          snapshot1: {
            rooms: 0,
            revenue: 0,
            adr: 0,
            occupancy: 0,
          },
          snapshot2: {
            rooms: 0,
            revenue: 0,
            adr: 0,
            occupancy: 0,
          },
        };
      }
      monthlyPickup[monthKey].snapshot1.rooms += Number(row.roomNights);
      monthlyPickup[monthKey].snapshot1.revenue += Number(row.roomRevenue);
      monthlyPickup[monthKey].snapshot1.occupancy += Number(row.occupancyPercent);
    });

    // Process snapshot2 (newer) and calculate pickup
    data2.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyPickup[monthKey]) {
        monthlyPickup[monthKey] = {
          month: monthKey,
          snapshot1: {
            rooms: 0,
            revenue: 0,
            adr: 0,
            occupancy: 0,
          },
          snapshot2: {
            rooms: 0,
            revenue: 0,
            adr: 0,
            occupancy: 0,
          },
        };
      }
      monthlyPickup[monthKey].snapshot2.rooms += Number(row.roomNights);
      monthlyPickup[monthKey].snapshot2.revenue += Number(row.roomRevenue);
      monthlyPickup[monthKey].snapshot2.occupancy += Number(row.occupancyPercent);
    });

    // Calculate pickup metrics and format for frontend
    const pickupData = Object.values(monthlyPickup)
      .map((month: any) => {
        const puRooms = month.snapshot2.rooms - month.snapshot1.rooms;
        const puRevenue = month.snapshot2.revenue - month.snapshot1.revenue;
        const puAdr =
          month.snapshot2.rooms > 0
            ? month.snapshot2.revenue / month.snapshot2.rooms
            : 0;
        const avgAdr1 =
          month.snapshot1.rooms > 0
            ? month.snapshot1.revenue / month.snapshot1.rooms
            : 0;
        const puAdrChange = puAdr - avgAdr1;

        // Format month name
        const [year, monthNum] = month.month.split('-');
        const monthNames = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];
        const monthName = monthNames[parseInt(monthNum) - 1];

        return {
          name: `${monthName} ${year}`,
          month: month.month,
          occupancy: Number(month.snapshot2.occupancy.toFixed(2)),
          rooms: Math.round(month.snapshot2.rooms),
          adr: Number(avgAdr1.toFixed(2)),
          revenue: Number(month.snapshot1.revenue.toFixed(2)),
          puRooms: Math.round(puRooms),
          puAdr: Number(puAdrChange.toFixed(2)),
          puRevenue: Number(puRevenue.toFixed(2)),
        };
      })
      .sort((a: any, b: any) => a.month.localeCompare(b.month));

    return res.json({
      snapshot1: {
        id: snapshot1.id,
        snapshotTime: snapshot1.snapshotTime,
        filename: snapshot1.originalFilename,
      },
      snapshot2: {
        id: snapshot2.id,
        snapshotTime: snapshot2.snapshotTime,
        filename: snapshot2.originalFilename,
      },
      pickup: pickupData,
    });
  } catch (error) {
    console.error('Error calculating pickup:', error);
    return res.status(500).json({ error: 'Failed to calculate pickup' });
  }
});

export default router;

