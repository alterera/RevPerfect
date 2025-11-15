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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function getTopChannels() {
  try {
    // First, get all hotels
    const hotelsResponse = await fetch(`${API_BASE_URL}/api/hotels`);
    if (!hotelsResponse.ok) {
      throw new Error('Failed to fetch hotels');
    }
    const hotels = await hotelsResponse.json();

    if (hotels.length === 0) {
      return [];
    }

    // Use the first active hotel (for prototype)
    const hotelId = hotels[2].id;

    // Get pickup data for this hotel
    const pickupResponse = await fetch(`${API_BASE_URL}/api/pickup/${hotelId}`);
    if (!pickupResponse.ok) {
      const error = await pickupResponse.json();
      throw new Error(error.error || 'Failed to fetch pickup data');
    }
    const pickupData = await pickupResponse.json();

    // Return the pickup data formatted for the table
    return pickupData.pickup || [];
  } catch (error) {
    console.error('Error fetching pickup data:', error);
    // Return empty array on error
    return [];
  }
}
