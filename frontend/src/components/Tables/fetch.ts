import * as logos from "@/assets/logos";

export async function getTopProducts() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return [
    {
      image: "/images/product/product-01.png",
      name: "Apple Watch Series 7",
      category: "Electronics",
      price: 296,
      sold: 22,
      profit: 45,
    },
    {
      image: "/images/product/product-02.png",
      name: "Macbook Pro M1",
      category: "Electronics",
      price: 546,
      sold: 12,
      profit: 125,
    },
    {
      image: "/images/product/product-03.png",
      name: "Dell Inspiron 15",
      category: "Electronics",
      price: 443,
      sold: 64,
      profit: 247,
    },
    {
      image: "/images/product/product-04.png",
      name: "HP Probook 450",
      category: "Electronics",
      price: 499,
      sold: 72,
      profit: 103,
    },
  ];
}

export async function getInvoiceTableData() {
  // Fake delay
  await new Promise((resolve) => setTimeout(resolve, 1400));

  return [
    {
      name: "Free package",
      price: 0.0,
      date: "2023-01-13T18:00:00.000Z",
      status: "Paid",
    },
    {
      name: "Standard Package",
      price: 59.0,
      date: "2023-01-13T18:00:00.000Z",
      status: "Paid",
    },
    {
      name: "Business Package",
      price: 99.0,
      date: "2023-01-13T18:00:00.000Z",
      status: "Unpaid",
    },
    {
      name: "Standard Package",
      price: 59.0,
      date: "2023-01-13T18:00:00.000Z",
      status: "Pending",
    },
  ];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://20.98.131.76';

export async function getHotelId(): Promise<string | null> {
  try {
    const hotelsResponse = await fetch(`${API_BASE_URL}/api/hotels`);
    if (!hotelsResponse.ok) {
      throw new Error('Failed to fetch hotels');
    }
    const hotels = await hotelsResponse.json();

    if (hotels.length === 0) {
      return null;
    }

    // Use the first active hotel (for prototype)
    return hotels[2]?.id || hotels[0]?.id || null;
  } catch (error) {
    console.error('Error fetching hotels:', error);
    return null;
  }
}

export async function getFullPickupData() {
  try {
    const hotelId = await getHotelId();
    if (!hotelId) {
      return null;
    }

    const pickupResponse = await fetch(`${API_BASE_URL}/api/pickup/${hotelId}`);
    if (!pickupResponse.ok) {
      const error = await pickupResponse.json();
      throw new Error(error.error || 'Failed to fetch pickup data');
    }
    return await pickupResponse.json();
  } catch (error) {
    console.error('Error fetching pickup data:', error);
    return null;
  }
}

export async function getTopChannels() {
  try {
    const pickupData = await getFullPickupData();
    
    if (!pickupData) {
      return [];
    }

    // Combine MTD and monthly data, with MTD first
    const allPickupData = [];
    
    if (pickupData.pickup?.mtd) {
      allPickupData.push(pickupData.pickup.mtd);
    }
    
    if (pickupData.pickup?.monthly) {
      allPickupData.push(...pickupData.pickup.monthly);
    }

    return allPickupData;
  } catch (error) {
    console.error('Error fetching pickup data:', error);
    return [];
  }
}

export async function getDailyPickup(snapshot1Id?: string, snapshot2Id?: string) {
  try {
    const hotelId = await getHotelId();
    if (!hotelId) {
      return null;
    }

    const params = new URLSearchParams();
    if (snapshot1Id) params.append('snapshot1Id', snapshot1Id);
    if (snapshot2Id) params.append('snapshot2Id', snapshot2Id);

    const response = await fetch(`${API_BASE_URL}/api/pickup/${hotelId}/daily?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch daily pickup data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching daily pickup data:', error);
    return null;
  }
}

export async function getActualVsSnapshot(snapshotId?: string) {
  try {
    const hotelId = await getHotelId();
    if (!hotelId) {
      return null;
    }

    const params = new URLSearchParams();
    if (snapshotId) params.append('snapshotId', snapshotId);

    const response = await fetch(`${API_BASE_URL}/api/comparison/${hotelId}/actual-vs-snapshot?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch actual vs snapshot data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching actual vs snapshot data:', error);
    return null;
  }
}

export async function getSTLYComparison(date?: string) {
  try {
    const hotelId = await getHotelId();
    if (!hotelId) {
      return null;
    }

    const params = new URLSearchParams();
    if (date) params.append('date', date);

    const response = await fetch(`${API_BASE_URL}/api/comparison/${hotelId}/stly?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch STLY comparison data');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching STLY comparison data:', error);
    return null;
  }
}
