import fs from 'fs';
import path from 'path';
import { fileProcessorService } from './services/fileProcessor.service.js';
import { calculateFileHash } from './utils/fileHash.js';

/**
 * Test script to verify file parsing with the sample file
 */
async function testFileParser() {
  console.log('='.repeat(80));
  console.log('Testing File Parser with Sample Data');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Read the sample file
    const sampleFilePath = path.join(
      process.cwd(),
      'history_forecast99383127.txt'
    );

    console.log(`Reading file: ${sampleFilePath}`);

    if (!fs.existsSync(sampleFilePath)) {
      console.error('✗ Sample file not found!');
      console.error(`  Expected location: ${sampleFilePath}`);
      process.exit(1);
    }

    const buffer = fs.readFileSync(sampleFilePath);
    console.log(`✓ File loaded successfully (${buffer.length} bytes)\n`);

    // Calculate file hash
    const fileHash = calculateFileHash(buffer);
    console.log(`File Hash: ${fileHash}\n`);

    // Extract snapshot time from filename
    const filename = path.basename(sampleFilePath);
    const snapshotTime = fileProcessorService.extractSnapshotTime(filename);
    console.log(`Extracted Snapshot Time: ${snapshotTime.toISOString()}\n`);

    // Parse the file
    console.log('Parsing file...\n');
    const totalAvailableRooms = 500; // Test value - should match hotel's totalAvailableRooms
    const parsedRows = fileProcessorService.parseHistoryForecastFile(buffer, totalAvailableRooms);

    console.log('='.repeat(80));
    console.log('Parsing Results:');
    console.log(`  Total rows parsed: ${parsedRows.length}`);
    console.log('='.repeat(80));
    console.log('');

    if (parsedRows.length > 0) {
      // Show statistics
      const historyRows = parsedRows.filter(
        (row) => row.dataType === 'HISTORY'
      );
      const forecastRows = parsedRows.filter(
        (row) => row.dataType === 'FORECAST'
      );

      console.log('Statistics:');
      console.log(`  History rows: ${historyRows.length}`);
      console.log(`  Forecast rows: ${forecastRows.length}`);
      console.log('');

      // Show first 5 rows
      console.log('First 5 rows:');
      console.log('-'.repeat(80));

      for (let i = 0; i < Math.min(5, parsedRows.length); i++) {
        const row = parsedRows[i];
        console.log(`\nRow ${i + 1}:`);
        console.log(`  Type: ${row.dataType}`);
        console.log(`  Stay Date: ${row.stayDate.toISOString().split('T')[0]}`);
        console.log(`  Room Nights: ${row.roomNights}`);
        console.log(`  Revenue: $${row.roomRevenue.toFixed(2)}`);
        console.log(`  ADR: $${row.adr.toFixed(2)}`);
        console.log(`  RevPAR: $${row.revPAR.toFixed(2)}`);
        console.log(`  Occupancy: ${row.occupancyPercent.toFixed(2)}%`);
        console.log(`  OO Rooms: ${row.ooRooms}`);
      }

      console.log('');
      console.log('-'.repeat(80));
      console.log('');

      // Show last 3 rows
      console.log('Last 3 rows:');
      console.log('-'.repeat(80));

      for (
        let i = Math.max(0, parsedRows.length - 3);
        i < parsedRows.length;
        i++
      ) {
        const row = parsedRows[i];
        console.log(`\nRow ${i + 1}:`);
        console.log(`  Type: ${row.dataType}`);
        console.log(`  Stay Date: ${row.stayDate.toISOString().split('T')[0]}`);
        console.log(`  Room Nights: ${row.roomNights}`);
        console.log(`  Revenue: $${row.roomRevenue.toFixed(2)}`);
        console.log(`  ADR: $${row.adr.toFixed(2)}`);
      }

      console.log('');
      console.log('='.repeat(80));
      console.log('✓ File parsing test completed successfully!');
      console.log('='.repeat(80));
    } else {
      console.log('⚠ No rows were parsed from the file.');
    }
  } catch (error) {
    console.error('\n✗ Error during test:', error);
    process.exit(1);
  }
}

// Run the test
testFileParser();

