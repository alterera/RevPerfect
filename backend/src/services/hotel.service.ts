import { prisma } from '../utils/prisma.js';
import type { Hotel } from '@prisma/client';

class HotelService {
  /**
   * Get hotel by email address
   * Used to map sender email to hotel
   * @param email - Hotel email address
   * @returns Hotel object or null
   */
  async getHotelByEmail(email: string): Promise<Hotel | null> {
    try {
      const hotel = await prisma.hotel.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!hotel) {
        console.warn(`No hotel found for email: ${email}`);
      }

      return hotel;
    } catch (error) {
      console.error('Error fetching hotel by email:', error);
      throw error;
    }
  }

  /**
   * Get hotel by ID
   * @param id - Hotel ID
   * @returns Hotel object or null
   */
  async getHotelById(id: string): Promise<Hotel | null> {
    try {
      const hotel = await prisma.hotel.findUnique({
        where: { id },
      });

      return hotel;
    } catch (error) {
      console.error('Error fetching hotel by ID:', error);
      throw error;
    }
  }

  /**
   * Create a new hotel (admin function)
   * @param name - Hotel name
   * @param email - Hotel email
   * @param totalAvailableRooms - Total available rooms (default: 0)
   * @returns Created hotel
   */
  async createHotel(name: string, email: string, totalAvailableRooms: number = 0): Promise<Hotel> {
    try {
      const hotel = await prisma.hotel.create({
        data: {
          name,
          email: email.toLowerCase(),
          totalAvailableRooms,
          isActive: true,
        },
      });

      console.log(`Hotel created: ${hotel.name} (${hotel.email}) with ${totalAvailableRooms} rooms`);
      return hotel;
    } catch (error) {
      console.error('Error creating hotel:', error);
      throw error;
    }
  }

  /**
   * Update hotel information
   * @param id - Hotel ID
   * @param data - Update data
   * @returns Updated hotel
   */
  async updateHotel(
    id: string,
    data: { name?: string; email?: string; isActive?: boolean; totalAvailableRooms?: number }
  ): Promise<Hotel> {
    try {
      const hotel = await prisma.hotel.update({
        where: { id },
        data: {
          ...data,
          email: data.email ? data.email.toLowerCase() : undefined,
        },
      });

      console.log(`Hotel updated: ${hotel.name}`);
      return hotel;
    } catch (error) {
      console.error('Error updating hotel:', error);
      throw error;
    }
  }

  /**
   * Get all active hotels
   * @returns Array of active hotels
   */
  async getAllActiveHotels(): Promise<Hotel[]> {
    try {
      const hotels = await prisma.hotel.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });

      return hotels;
    } catch (error) {
      console.error('Error fetching active hotels:', error);
      throw error;
    }
  }

  /**
   * Get all hotels (including inactive)
   * @returns Array of all hotels
   */
  async getAllHotels(): Promise<Hotel[]> {
    try {
      const hotels = await prisma.hotel.findMany({
        orderBy: { name: 'asc' },
      });

      return hotels;
    } catch (error) {
      console.error('Error fetching all hotels:', error);
      throw error;
    }
  }

  /**
   * Deactivate hotel
   * @param id - Hotel ID
   * @returns Updated hotel
   */
  async deactivateHotel(id: string): Promise<Hotel> {
    try {
      const hotel = await prisma.hotel.update({
        where: { id },
        data: { isActive: false },
      });

      console.log(`Hotel deactivated: ${hotel.name}`);
      return hotel;
    } catch (error) {
      console.error('Error deactivating hotel:', error);
      throw error;
    }
  }

  /**
   * Activate hotel
   * @param id - Hotel ID
   * @returns Updated hotel
   */
  async activateHotel(id: string): Promise<Hotel> {
    try {
      const hotel = await prisma.hotel.update({
        where: { id },
        data: { isActive: true },
      });

      console.log(`Hotel activated: ${hotel.name}`);
      return hotel;
    } catch (error) {
      console.error('Error activating hotel:', error);
      throw error;
    }
  }

  /**
   * Get total available rooms for a hotel
   * @param hotelId - Hotel ID
   * @returns Total available rooms or 0 if hotel not found
   */
  async getTotalAvailableRooms(hotelId: string): Promise<number> {
    try {
      const hotel = await prisma.hotel.findUnique({
        where: { id: hotelId },
        select: { totalAvailableRooms: true },
      });

      return hotel?.totalAvailableRooms ?? 0;
    } catch (error) {
      console.error('Error fetching total available rooms:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const hotelService = new HotelService();
export default hotelService;

