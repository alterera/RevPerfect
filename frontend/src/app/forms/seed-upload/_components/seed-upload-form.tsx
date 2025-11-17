'use client';

import { useState, useEffect } from 'react';
import InputGroup from "@/components/FormElements/InputGroup";
import { ShowcaseSection } from "@/components/Layouts/showcase-section";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface Hotel {
  id: string;
  name: string;
  email: string;
}

export function SeedUploadForm() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [onboardingDate, setOnboardingDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function fetchHotels() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/hotels`);
        if (!response.ok) {
          throw new Error('Failed to fetch hotels');
        }
        const data = await response.json();
        setHotels(data);
        if (data.length > 0) {
          setSelectedHotelId(data[0].id);
        }
      } catch (error) {
        console.error('Error fetching hotels:', error);
        setMessage({ type: 'error', text: 'Failed to load hotels. Please refresh the page.' });
      } finally {
        setLoading(false);
      }
    }

    fetchHotels();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type (should be .txt)
      if (!selectedFile.name.endsWith('.txt')) {
        setMessage({ type: 'error', text: 'Please upload a .txt file' });
        return;
      }
      setFile(selectedFile);
      setMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedHotelId) {
      setMessage({ type: 'error', text: 'Please select a hotel' });
      return;
    }

    if (!file) {
      setMessage({ type: 'error', text: 'Please select a file to upload' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const params = new URLSearchParams();
      if (onboardingDate) {
        params.append('onboardingDate', onboardingDate);
      }

      const response = await fetch(
        `${API_BASE_URL}/api/hotels/${selectedHotelId}/seed?${params.toString()}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload seed data');
      }

      setMessage({
        type: 'success',
        text: `Seed snapshot created successfully! ${data.message || `Uploaded ${data.snapshot?.rowCount || 0} rows.`}`,
      });

      // Reset form
      setFile(null);
      setOnboardingDate('');
      const fileInput = document.getElementById('file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (error) {
      console.error('Error uploading seed data:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to upload seed data. Please try again.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <ShowcaseSection title="Upload Seed Data" className="!p-6.5">
      <form onSubmit={handleSubmit}>
        <div className="mb-4.5">
          <label className="mb-2.5 block text-sm font-medium text-dark dark:text-white">
            Select Hotel <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedHotelId}
            onChange={(e) => setSelectedHotelId(e.target.value)}
            className="w-full rounded-lg border border-stroke bg-transparent px-5 py-3 text-dark outline-none transition focus:border-primary focus-1 active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
            required
            disabled={loading || uploading}
          >
            {loading ? (
              <option>Loading hotels...</option>
            ) : hotels.length === 0 ? (
              <option>No hotels available</option>
            ) : (
              hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name} ({hotel.email})
                </option>
              ))
            )}
          </select>
        </div>

        <div className="mb-4.5">
          <label className="mb-2.5 block text-sm font-medium text-dark dark:text-white">
            Upload Seed File <span className="text-red-500">*</span>
          </label>
          <input
            id="file-input"
            type="file"
            accept=".txt"
            onChange={handleFileChange}
            className="w-full rounded-lg border border-stroke bg-transparent px-5 py-3 text-dark outline-none transition focus:border-primary focus-1 active:border-primary disabled:cursor-default disabled:bg-whiter dark:border-form-strokedark dark:bg-form-input dark:text-white dark:focus:border-primary"
            required
            disabled={loading || uploading}
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Upload a tab-separated .txt file containing one year of historical data (365 days).
            The file should have the same format as hourly snapshot files.
          </p>
        </div>

        <InputGroup
          label="Onboarding Date (Optional)"
          type="date"
          placeholder="Select onboarding date"
          value={onboardingDate}
          handleChange={(e) => setOnboardingDate(e.target.value)}
          className="mb-4.5"
          disabled={loading || uploading}
        />
        <p className="mb-4.5 text-xs text-gray-500 dark:text-gray-400">
          If not specified, the current date will be used as the snapshot time for the seed data.
        </p>

        {message && (
          <div
            className={`mb-4.5 rounded-lg p-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || uploading || !selectedHotelId || !file}
          className="flex w-full justify-center rounded-lg bg-primary p-[13px] font-medium text-white hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload Seed Data'}
        </button>
      </form>
    </ShowcaseSection>
  );
}

