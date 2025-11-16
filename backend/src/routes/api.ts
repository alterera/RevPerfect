import express from 'express';
import multer from 'multer';
import { hotelService } from '../services/hotel.service.js';
import { snapshotService } from '../services/snapshot.service.js';
import { blobStorageService } from '../services/blobStorage.service.js';
import { fileProcessorService } from '../services/fileProcessor.service.js';
import { calculateFileHash } from '../utils/fileHash.js';
import { prisma } from '../utils/prisma.js';

const router = express.Router();

// Configure multer for file uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage() });

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
 * POST /api/hotels/:hotelId/seed
 * Upload seed snapshot file (1 year of historical data)
 * Accepts multipart/form-data with 'file' field
 * Query params: onboardingDate (optional - defaults to current date)
 */
router.post('/hotels/:hotelId/seed', upload.single('file'), async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { onboardingDate } = req.query;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Validate hotel exists
    const hotel = await hotelService.getHotelById(hotelId);
    if (!hotel) {
      return res.status(404).json({ error: 'Hotel not found' });
    }

    // Check if seed snapshot already exists
    const existingSeed = await prisma.historyForecastSnapshot.findFirst({
      where: {
        hotelId,
        isSeedSnapshot: true,
      },
    });

    if (existingSeed) {
      return res.status(400).json({ 
        error: 'Seed snapshot already exists for this hotel',
        existingSeedId: existingSeed.id,
      });
    }

    // Calculate file hash
    const fileHash = calculateFileHash(file.buffer);
    console.log(`Seed file hash: ${fileHash.substring(0, 16)}...`);

    // Check for duplicate
    const existing = await snapshotService.checkDuplicateByHash(fileHash);
    if (existing) {
      return res.status(400).json({ 
        error: 'Duplicate file detected',
        existingSnapshotId: existing.id,
      });
    }

    // Upload to Azure Blob Storage
    console.log('Uploading seed file to Azure Blob Storage...');
    const blobUrl = await blobStorageService.uploadFile(
      hotelId,
      file.originalname,
      file.buffer
    );
    console.log(`Uploaded to: ${blobUrl}`);

    // Parse onboarding date or use current date
    const snapshotTime = onboardingDate 
      ? new Date(onboardingDate as string)
      : new Date();

    // Create seed snapshot record
    const snapshot = await snapshotService.createSnapshotRecord(
      {
        hotelId,
        snapshotTime,
        originalFilename: file.originalname,
        blobUrl,
        fileHash,
        uploadedAt: new Date(),
      },
      hotel.totalAvailableRooms || 0,
      true // isSeedSnapshot = true
    );

    // Parse file
    console.log('Parsing seed file...');
    const parsedRows = fileProcessorService.parseHistoryForecastFile(
      file.buffer,
      hotel.totalAvailableRooms || 0
    );
    console.log(`Parsed ${parsedRows.length} rows`);

    // Save data
    console.log('Saving seed data to database...');
    await snapshotService.saveSnapshotData(snapshot.id, parsedRows);
    console.log(`Saved ${parsedRows.length} rows`);

    return res.json({
      success: true,
      snapshot: {
        id: snapshot.id,
        snapshotTime: snapshot.snapshotTime,
        filename: snapshot.originalFilename,
        rowCount: parsedRows.length,
      },
      message: `Seed snapshot created successfully with ${parsedRows.length} rows`,
    });
  } catch (error) {
    console.error('Error uploading seed snapshot:', error);
    return res.status(500).json({ 
      error: 'Failed to upload seed snapshot',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Helper function to create pickup metadata for UI formatting
 */
function createPickupMetadata(value: number) {
  return {
    value: Number(value.toFixed(2)),
    isPositive: value > 0,
    isNegative: value < 0,
    isZero: value === 0,
  };
}

/**
 * GET /api/pickup/:hotelId
 * Compare two snapshots and return pickup data with MTD and monthly comparisons
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
      // Get latest two completed snapshots (exclude seed snapshots)
      const snapshots = await prisma.historyForecastSnapshot.findMany({
        where: {
          hotelId,
          processed: true,
          processingStatus: 'COMPLETED',
          isSeedSnapshot: false, // Only compare hourly snapshots
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

    // Validate both snapshots belong to the same hotel
    if (snapshot1.hotelId !== hotelId || snapshot2.hotelId !== hotelId) {
      return res.status(400).json({ error: 'Snapshots must belong to the specified hotel' });
    }

    // Ensure snapshot1 is older than snapshot2
    if (snapshot1.snapshotTime > snapshot2.snapshotTime) {
      [snapshot1, snapshot2] = [snapshot2, snapshot1];
    }

    // Get all forecast data for both snapshots
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

    // Calculate MTD (Month-To-Date) pickup
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Filter MTD data for both snapshots
    const mtdData1 = data1.filter(
      (row) => row.stayDate >= startOfCurrentMonth && row.stayDate <= today
    );
    const mtdData2 = data2.filter(
      (row) => row.stayDate >= startOfCurrentMonth && row.stayDate <= today
    );

    // Calculate MTD metrics for snapshot1
    const roomsMTD1 = mtdData1.reduce((sum, row) => sum + Number(row.roomNights), 0);
    const revenueMTD1 = mtdData1.reduce((sum, row) => sum + Number(row.roomRevenue), 0);
    const adrMTD1 = roomsMTD1 > 0 ? revenueMTD1 / roomsMTD1 : 0;
    // const totalRooms1 = snapshot1.totalAvailableRoomsSnapshot || 0;
    // const occupancyMTD1 = totalRooms1 > 0 ? (roomsMTD1 / totalRooms1) * 100 : 0;

    // Calculate MTD metrics for snapshot2
    const roomsMTD2 = mtdData2.reduce((sum, row) => sum + Number(row.roomNights), 0);
    const revenueMTD2 = mtdData2.reduce((sum, row) => sum + Number(row.roomRevenue), 0);
    const adrMTD2 = roomsMTD2 > 0 ? revenueMTD2 / roomsMTD2 : 0;
    const totalRooms2 = snapshot2.totalAvailableRoomsSnapshot || 0;
    const occupancyMTD2 = totalRooms2 > 0 ? (roomsMTD2 / totalRooms2) * 100 : 0;

    // Calculate MTD pickup
    const puRoomsMTD = roomsMTD2 - roomsMTD1;
    const puRevenueMTD = revenueMTD2 - revenueMTD1;
    const puADRMTD = adrMTD2 - adrMTD1;

    // Create MTD pickup row
    const mtdPickup = {
      month: 'MTD',
      name: 'MTD',
      occupancy: Number(occupancyMTD2.toFixed(2)),
      rooms: Math.round(roomsMTD2),
      adr: Number(adrMTD2.toFixed(2)),
      revenue: Number(revenueMTD2.toFixed(2)),
      puRooms: createPickupMetadata(puRoomsMTD),
      puADR: createPickupMetadata(puADRMTD),
      puRevenue: createPickupMetadata(puRevenueMTD),
    };

    // Group by month and calculate pickup
    const monthlyPickup: Record<string, any> = {};

    // Get all unique months from both snapshots to ensure we include all months
    const allMonths = new Set<string>();
    data1.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      allMonths.add(monthKey);
    });
    data2.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      allMonths.add(monthKey);
    });

    // Initialize all months with zero values
    allMonths.forEach((monthKey) => {
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
    });

    // Process snapshot1 (older)
    data1.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyPickup[monthKey].snapshot1.rooms += Number(row.roomNights);
      monthlyPickup[monthKey].snapshot1.revenue += Number(row.roomRevenue);
      monthlyPickup[monthKey].snapshot1.occupancy += Number(row.occupancyPercent);
    });

    // Process snapshot2 (newer)
    data2.forEach((row) => {
      const monthKey = `${row.stayDate.getFullYear()}-${String(row.stayDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyPickup[monthKey].snapshot2.rooms += Number(row.roomNights);
      monthlyPickup[monthKey].snapshot2.revenue += Number(row.roomRevenue);
      monthlyPickup[monthKey].snapshot2.occupancy += Number(row.occupancyPercent);
    });

    // Calculate pickup metrics and format for frontend
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

    const monthlyPickupData = Object.values(monthlyPickup)
      .map((month: any) => {
        const puRooms = month.snapshot2.rooms - month.snapshot1.rooms;
        const puRevenue = month.snapshot2.revenue - month.snapshot1.revenue;
        
        // Calculate ADR for both snapshots (safe divide)
        const adr2 = month.snapshot2.rooms > 0 
          ? month.snapshot2.revenue / month.snapshot2.rooms 
          : 0;
        const adr1 = month.snapshot1.rooms > 0 
          ? month.snapshot1.revenue / month.snapshot1.rooms 
          : 0;
        const puAdrChange = adr2 - adr1;

        // Format month name
        const [year, monthNum] = month.month.split('-');
        const monthName = monthNames[parseInt(monthNum) - 1];

        return {
          name: `${monthName} ${year}`,
          month: month.month,
          occupancy: Number(month.snapshot2.occupancy.toFixed(2)),
          rooms: Math.round(month.snapshot2.rooms),
          adr: Number(adr2.toFixed(2)),
          revenue: Number(month.snapshot2.revenue.toFixed(2)),
          puRooms: createPickupMetadata(puRooms),
          puADR: createPickupMetadata(puAdrChange),
          puRevenue: createPickupMetadata(puRevenue),
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
      pickup: {
        mtd: mtdPickup,
        monthly: monthlyPickupData,
      },
    });
  } catch (error) {
    console.error('Error calculating pickup:', error);
    return res.status(500).json({ error: 'Failed to calculate pickup' });
  }
});

/**
 * GET /api/pickup/:hotelId/daily
 * Day-by-day comparison between two snapshots
 * Query params: snapshot1Id, snapshot2Id (optional - defaults to latest two)
 */
router.get('/pickup/:hotelId/daily', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { snapshot1Id, snapshot2Id } = req.query;

    let snapshot1: any;
    let snapshot2: any;

    if (snapshot1Id && snapshot2Id) {
      snapshot1 = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshot1Id as string },
      });
      snapshot2 = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshot2Id as string },
      });
    } else {
      const snapshots = await prisma.historyForecastSnapshot.findMany({
        where: {
          hotelId,
          processed: true,
          processingStatus: 'COMPLETED',
          isSeedSnapshot: false,
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

      snapshot2 = snapshots[0];
      snapshot1 = snapshots[1];
    }

    if (!snapshot1 || !snapshot2) {
      return res.status(404).json({ error: 'One or both snapshots not found' });
    }

    if (snapshot1.hotelId !== hotelId || snapshot2.hotelId !== hotelId) {
      return res.status(400).json({ error: 'Snapshots must belong to the specified hotel' });
    }

    if (snapshot1.snapshotTime > snapshot2.snapshotTime) {
      [snapshot1, snapshot2] = [snapshot2, snapshot1];
    }

    // Get all forecast data for both snapshots
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

    // Create map of stay dates for quick lookup
    const data1Map = new Map(data1.map((d) => [d.stayDate.toISOString(), d]));
    const data2Map = new Map(data2.map((d) => [d.stayDate.toISOString(), d]));

    // Get all unique stay dates
    const allDates = new Set([
      ...data1.map((d) => d.stayDate.toISOString()),
      ...data2.map((d) => d.stayDate.toISOString()),
    ]);

    // Calculate daily pickup
    const dailyPickup = Array.from(allDates)
      .sort()
      .map((dateStr) => {
        // const date = new Date(dateStr);
        const d1 = data1Map.get(dateStr);
        const d2 = data2Map.get(dateStr);

        const rooms1 = d1 ? Number(d1.roomNights) : 0;
        const revenue1 = d1 ? Number(d1.roomRevenue) : 0;
        const adr1 = rooms1 > 0 ? revenue1 / rooms1 : 0;

        const rooms2 = d2 ? Number(d2.roomNights) : 0;
        const revenue2 = d2 ? Number(d2.roomRevenue) : 0;
        const adr2 = rooms2 > 0 ? revenue2 / rooms2 : 0;

        return {
          stayDate: dateStr.split('T')[0],
          snapshot1: {
            rooms: rooms1,
            revenue: revenue1,
            adr: adr1,
          },
          snapshot2: {
            rooms: rooms2,
            revenue: revenue2,
            adr: adr2,
          },
          pickup: {
            puRooms: createPickupMetadata(rooms2 - rooms1),
            puRevenue: createPickupMetadata(revenue2 - revenue1),
            puADR: createPickupMetadata(adr2 - adr1),
          },
        };
      });

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
      daily: dailyPickup,
    });
  } catch (error) {
    console.error('Error calculating daily pickup:', error);
    return res.status(500).json({ error: 'Failed to calculate daily pickup' });
  }
});

/**
 * GET /api/comparison/:hotelId/actual-vs-snapshot
 * Compare seed snapshot (actuals) vs selected snapshot
 * Query params: snapshotId (optional - defaults to latest)
 */
router.get('/comparison/:hotelId/actual-vs-snapshot', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { snapshotId } = req.query;

    // Get seed snapshot
    const seedSnapshot = await prisma.historyForecastSnapshot.findFirst({
      where: {
        hotelId,
        isSeedSnapshot: true,
        processed: true,
        processingStatus: 'COMPLETED',
      },
      orderBy: { snapshotTime: 'asc' },
    });

    if (!seedSnapshot) {
      return res.status(404).json({ error: 'Seed snapshot not found for this hotel' });
    }

    // Get comparison snapshot
    let comparisonSnapshot: any;
    if (snapshotId) {
      comparisonSnapshot = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshotId as string },
      });
    } else {
      comparisonSnapshot = await prisma.historyForecastSnapshot.findFirst({
        where: {
          hotelId,
          processed: true,
          processingStatus: 'COMPLETED',
          isSeedSnapshot: false,
        },
        orderBy: { snapshotTime: 'desc' },
      });
    }

    if (!comparisonSnapshot) {
      return res.status(404).json({ error: 'Comparison snapshot not found' });
    }

    if (comparisonSnapshot.hotelId !== hotelId) {
      return res.status(400).json({ error: 'Snapshot must belong to the specified hotel' });
    }

    // Get seed data (HISTORY only)
    const seedData = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: seedSnapshot.id,
        dataType: 'HISTORY',
      },
      orderBy: { stayDate: 'asc' },
    });

    // Get comparison snapshot data (both HISTORY and FORECAST)
    const comparisonData = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: comparisonSnapshot.id,
      },
      orderBy: { stayDate: 'asc' },
    });

    // Create maps for quick lookup
    const seedMap = new Map(seedData.map((d) => [d.stayDate.toISOString(), d]));
    const comparisonMap = new Map(comparisonData.map((d) => [d.stayDate.toISOString(), d]));

    // Get all unique stay dates
    const allDates = new Set([
      ...seedData.map((d) => d.stayDate.toISOString()),
      ...comparisonData.map((d) => d.stayDate.toISOString()),
    ]);

    // Calculate daily comparison
    const dailyComparison = Array.from(allDates)
      .sort()
      .map((dateStr) => {
        // const date = new Date(dateStr);
        const seed = seedMap.get(dateStr);
        const comp = comparisonMap.get(dateStr);

        const seedRooms = seed ? Number(seed.roomNights) : 0;
        const seedRevenue = seed ? Number(seed.roomRevenue) : 0;
        const seedAdr = seedRooms > 0 ? seedRevenue / seedRooms : 0;

        const compRooms = comp ? Number(comp.roomNights) : 0;
        const compRevenue = comp ? Number(comp.roomRevenue) : 0;
        const compAdr = compRooms > 0 ? compRevenue / compRooms : 0;

        return {
          stayDate: dateStr.split('T')[0],
          dataType: comp?.dataType || null,
          actual: {
            rooms: seedRooms,
            revenue: seedRevenue,
            adr: seedAdr,
          },
          snapshot: {
            rooms: compRooms,
            revenue: compRevenue,
            adr: compAdr,
          },
          difference: {
            puRooms: createPickupMetadata(compRooms - seedRooms),
            puRevenue: createPickupMetadata(compRevenue - seedRevenue),
            puADR: createPickupMetadata(compAdr - seedAdr),
          },
        };
      });

    return res.json({
      seedSnapshot: {
        id: seedSnapshot.id,
        snapshotTime: seedSnapshot.snapshotTime,
        filename: seedSnapshot.originalFilename,
      },
      comparisonSnapshot: {
        id: comparisonSnapshot.id,
        snapshotTime: comparisonSnapshot.snapshotTime,
        filename: comparisonSnapshot.originalFilename,
      },
      daily: dailyComparison,
    });
  } catch (error) {
    console.error('Error calculating actual vs snapshot:', error);
    return res.status(500).json({ error: 'Failed to calculate actual vs snapshot comparison' });
  }
});

/**
 * GET /api/comparison/:hotelId/stly
 * STLY (Same Time Last Year) comparison
 * Query params: date (optional - defaults to today)
 */
router.get('/comparison/:hotelId/stly', async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : new Date();
    const lastYearDate = new Date(targetDate);
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);

    // Find snapshot from 1 year ago (within ±7 days window)
    const stlySnapshots = await prisma.historyForecastSnapshot.findMany({
      where: {
        hotelId,
        processed: true,
        processingStatus: 'COMPLETED',
        isSeedSnapshot: false,
        snapshotTime: {
          gte: new Date(lastYearDate.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(lastYearDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { snapshotTime: 'asc' },
    });

    if (stlySnapshots.length === 0) {
      return res.status(404).json({ 
        error: 'No snapshot found from approximately 1 year ago',
        targetDate: lastYearDate.toISOString(),
      });
    }

    const stlySnapshot = stlySnapshots[0]; // Use closest one

    // Get latest snapshot
    const latestSnapshot = await prisma.historyForecastSnapshot.findFirst({
      where: {
        hotelId,
        processed: true,
        processingStatus: 'COMPLETED',
        isSeedSnapshot: false,
      },
      orderBy: { snapshotTime: 'desc' },
    });

    if (!latestSnapshot) {
      return res.status(404).json({ error: 'No latest snapshot found' });
    }

    // Get data for both snapshots
    const stlyData = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: stlySnapshot.id,
        dataType: 'FORECAST',
      },
      orderBy: { stayDate: 'asc' },
    });

    const latestData = await prisma.historyForecastData.findMany({
      where: {
        snapshotId: latestSnapshot.id,
        dataType: 'FORECAST',
      },
      orderBy: { stayDate: 'asc' },
    });

    // Create maps
    const stlyMap = new Map(stlyData.map((d) => [d.stayDate.toISOString(), d]));
    const latestMap = new Map(latestData.map((d) => [d.stayDate.toISOString(), d]));

    // Get all unique stay dates
    const allDates = new Set([
      ...stlyData.map((d) => d.stayDate.toISOString()),
      ...latestData.map((d) => d.stayDate.toISOString()),
    ]);

    // Calculate STLY comparison
    const stlyComparison = Array.from(allDates)
      .sort()
      .map((dateStr) => {
        // const date = new Date(dateStr);
        const stly = stlyMap.get(dateStr);
        const latest = latestMap.get(dateStr);

        const stlyRooms = stly ? Number(stly.roomNights) : 0;
        const stlyRevenue = stly ? Number(stly.roomRevenue) : 0;
        const stlyAdr = stlyRooms > 0 ? stlyRevenue / stlyRooms : 0;

        const latestRooms = latest ? Number(latest.roomNights) : 0;
        const latestRevenue = latest ? Number(latest.roomRevenue) : 0;
        const latestAdr = latestRooms > 0 ? latestRevenue / latestRooms : 0;

        return {
          stayDate: dateStr.split('T')[0],
          stly: {
            rooms: stlyRooms,
            revenue: stlyRevenue,
            adr: stlyAdr,
          },
          latest: {
            rooms: latestRooms,
            revenue: latestRevenue,
            adr: latestAdr,
          },
          difference: {
            puRooms: createPickupMetadata(latestRooms - stlyRooms),
            puRevenue: createPickupMetadata(latestRevenue - stlyRevenue),
            puADR: createPickupMetadata(latestAdr - stlyAdr),
          },
        };
      });

    return res.json({
      stlySnapshot: {
        id: stlySnapshot.id,
        snapshotTime: stlySnapshot.snapshotTime,
        filename: stlySnapshot.originalFilename,
      },
      latestSnapshot: {
        id: latestSnapshot.id,
        snapshotTime: latestSnapshot.snapshotTime,
        filename: latestSnapshot.originalFilename,
      },
      daily: stlyComparison,
    });
  } catch (error) {
    console.error('Error calculating STLY comparison:', error);
    return res.status(500).json({ error: 'Failed to calculate STLY comparison' });
  }
});

export default router;

