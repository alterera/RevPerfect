'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { standardFormat } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { ComparisonSelector, type ComparisonType } from "./comparison-selector";
import { 
  getTopChannels, 
  getDailyPickup, 
  getActualVsSnapshot, 
  getSTLYComparison 
} from "../fetch";

export function TopChannels({ className }: { className?: string }) {
  const [comparisonType, setComparisonType] = useState<ComparisonType>('pickup');
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [allDailyData, setAllDailyData] = useState<any[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      
      try {
        if (comparisonType === 'pickup') {
  const data = await getTopChannels();
          setMonthlyData(data);
          
          // Pre-fetch all daily data for pickup comparison
          const dailyData = await getDailyPickup();
          if (dailyData?.daily) {
            setAllDailyData(dailyData.daily);
          }
        } else {
          // For other comparison types, fetch daily data
          setMonthlyData([]);
          let data: any = null;
          
          if (comparisonType === 'actual-vs-snapshot') {
            data = await getActualVsSnapshot();
          } else if (comparisonType === 'stly') {
            data = await getSTLYComparison();
          }
          
          if (data?.daily) {
            setAllDailyData(data.daily);
          } else {
            setAllDailyData([]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [comparisonType]);

  // Parse month string (e.g., "November 2025" or "2025-11") to get YYYY-MM format
  const parseMonthKey = (monthStr: string): string | null => {
    if (!monthStr || monthStr === 'MTD') return null;
    
    // If already in YYYY-MM format
    if (/^\d{4}-\d{2}$/.test(monthStr)) {
      return monthStr;
    }
    
    // Try to parse "November 2025" format
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const parts = monthStr.trim().split(' ');
    if (parts.length === 2) {
      const monthName = parts[0];
      const year = parts[1];
      const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
      
      if (monthIndex !== -1 && /^\d{4}$/.test(year)) {
        return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      }
    }
    
    return null;
  };

  // Filter daily data for a specific month
  const getDailyDataForMonth = (monthKey: string | null): any[] => {
    if (!monthKey || !allDailyData.length) return [];
    
    return allDailyData.filter((row: any) => {
      const stayDate = new Date(row.stayDate);
      const rowMonthKey = `${stayDate.getFullYear()}-${String(stayDate.getMonth() + 1).padStart(2, '0')}`;
      return rowMonthKey === monthKey;
    });
  };

  const handleMonthClick = (month: string) => {
    const monthKey = parseMonthKey(month);
    if (monthKey && monthKey === expandedMonth) {
      setExpandedMonth(null);
    } else if (monthKey) {
      setExpandedMonth(monthKey);
    }
  };

  const hasData = monthlyData.length > 0;

  if (loading) {
    return (
      <div
        className={cn(
          "grid rounded-[10px] bg-white px-7.5 pb-4 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card",
          className,
        )}
      >
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "grid rounded-[10px] bg-white px-7.5 pb-4 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card",
          className,
        )}
      >
        <div className="py-8 text-center text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!hasData) {
  return (
    <div
      className={cn(
        "grid rounded-[10px] bg-white px-7.5 pb-4 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card",
        className,
      )}
    >
      <h2 className="mb-4 text-body-2xlg font-bold text-dark dark:text-white">
        Pickup Table
      </h2>
        <div className="py-8 text-center text-gray-500">
          No data available. Make sure you have completed snapshots.
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid rounded-[10px] bg-white px-7.5 pb-4 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-body-2xlg font-bold text-dark dark:text-white">
          Pickup Table
        </h2>
        <div className="flex items-center gap-3">
          <ComparisonSelector value={comparisonType} onChange={setComparisonType} />
        </div>
      </div>

      {comparisonType === 'pickup' ? (
      <Table>
        <TableHeader>
          <TableRow className="border-none uppercase [&>th]:text-center">
            <TableHead className="min-w-[120px] !text-left">Month</TableHead>
            <TableHead>Occupancy</TableHead>
            <TableHead className="!text-right">Rooms</TableHead>
            <TableHead>ADR</TableHead>
            <TableHead>Revenue</TableHead>
            <TableHead>PU Rooms</TableHead>
            <TableHead>PU ADR</TableHead>
            <TableHead>PU Revenue</TableHead>
          </TableRow>
        </TableHeader>
          <TableBody>
            {monthlyData.map((row: any, i: number) => {
              const puRooms = typeof row.puRooms === 'object' ? row.puRooms.value : row.puRooms;
              const puADR = typeof row.puADR === 'object' ? row.puADR.value : (row.puAdr || 0);
              const puRevenue = typeof row.puRevenue === 'object' ? row.puRevenue.value : row.puRevenue;
              
              const puRoomsIsPositive = typeof row.puRooms === 'object' ? row.puRooms.isPositive : puRooms >= 0;
              const puADRIsPositive = typeof row.puADR === 'object' ? row.puADR.isPositive : puADR >= 0;
              const puRevenueIsPositive = typeof row.puRevenue === 'object' ? row.puRevenue.isPositive : puRevenue >= 0;

              const monthKey = parseMonthKey(row.month);
              const isExpanded = expandedMonth === monthKey;
              const isClickable = monthKey !== null && row.month !== 'MTD';
              const dailyRows = isExpanded ? getDailyDataForMonth(monthKey) : [];

              return (
                <>
            <TableRow
                    className={cn(
                      "text-center text-base font-medium text-dark dark:text-white",
                      isClickable && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    )}
                    key={row.month + i}
                    onClick={() => isClickable && handleMonthClick(row.month)}
                  >
                    <TableCell className="!text-left">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold">{row.name}</div>
                        {isClickable && (
                          <span className="text-xs text-gray-400">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{row.occupancy}%</TableCell>
                    <TableCell className="!text-right">
                      {standardFormat(row.rooms)}
                    </TableCell>
                    <TableCell>${standardFormat(row.adr)}</TableCell>
                    <TableCell>${standardFormat(row.revenue)}</TableCell>
                    <TableCell className={puRoomsIsPositive ? "text-green-600" : puRooms === 0 ? "text-gray-600" : "text-red-600"}>
                      {puRoomsIsPositive && puRooms !== 0 ? "+" : ""}{standardFormat(puRooms)}
                    </TableCell>
                    <TableCell className={puADRIsPositive ? "text-green-600" : puADR === 0 ? "text-gray-600" : "text-red-600"}>
                      {puADRIsPositive && puADR !== 0 ? "+" : ""}${standardFormat(puADR)}
                    </TableCell>
                    <TableCell className={puRevenueIsPositive ? "text-green-600" : puRevenue === 0 ? "text-gray-600" : "text-red-600"}>
                      {puRevenueIsPositive && puRevenue !== 0 ? "+" : ""}${standardFormat(puRevenue)}
                    </TableCell>
                  </TableRow>
                  {isExpanded && dailyRows.length > 0 && (
                    <>
                      <TableRow key={`${row.month}-daily-header`} className="bg-gray-50 dark:bg-gray-800">
                        <TableCell colSpan={8} className="!text-left text-xs font-semibold text-gray-600 dark:text-gray-400 py-2">
                          Daily Breakdown for {row.name}
              </TableCell>
                      </TableRow>
                      {dailyRows.map((dailyRow: any, dailyIndex: number) => {
                        const dailyPuRooms = typeof dailyRow.pickup?.puRooms === 'object' ? dailyRow.pickup.puRooms.value : dailyRow.pickup?.puRooms || 0;
                        const dailyPuADR = typeof dailyRow.pickup?.puADR === 'object' ? dailyRow.pickup.puADR.value : dailyRow.pickup?.puADR || 0;
                        const dailyPuRevenue = typeof dailyRow.pickup?.puRevenue === 'object' ? dailyRow.pickup.puRevenue.value : dailyRow.pickup?.puRevenue || 0;
                        
                        const dailyPuRoomsIsPositive = typeof dailyRow.pickup?.puRooms === 'object' ? dailyRow.pickup.puRooms.isPositive : dailyPuRooms >= 0;
                        const dailyPuADRIsPositive = typeof dailyRow.pickup?.puADR === 'object' ? dailyRow.pickup.puADR.isPositive : dailyPuADR >= 0;
                        const dailyPuRevenueIsPositive = typeof dailyRow.pickup?.puRevenue === 'object' ? dailyRow.pickup.puRevenue.isPositive : dailyPuRevenue >= 0;

                        return (
                          <TableRow
                            key={`${row.month}-daily-${dailyIndex}`}
                            className="text-center text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50"
                          >
                            <TableCell className="!text-left pl-8">
                              <div className="font-medium">{dailyRow.stayDate}</div>
                            </TableCell>
                            <TableCell>-</TableCell>
                            <TableCell className="!text-right">
                              {standardFormat(dailyRow.snapshot2?.rooms || 0)}
                            </TableCell>
                            <TableCell>${standardFormat(dailyRow.snapshot2?.adr || 0)}</TableCell>
                            <TableCell>${standardFormat(dailyRow.snapshot2?.revenue || 0)}</TableCell>
                            <TableCell className={dailyPuRoomsIsPositive ? "text-green-600" : dailyPuRooms === 0 ? "text-gray-600" : "text-red-600"}>
                              {dailyPuRoomsIsPositive && dailyPuRooms !== 0 ? "+" : ""}{standardFormat(dailyPuRooms)}
                            </TableCell>
                            <TableCell className={dailyPuADRIsPositive ? "text-green-600" : dailyPuADR === 0 ? "text-gray-600" : "text-red-600"}>
                              {dailyPuADRIsPositive && dailyPuADR !== 0 ? "+" : ""}${standardFormat(dailyPuADR)}
                            </TableCell>
                            <TableCell className={dailyPuRevenueIsPositive ? "text-green-600" : dailyPuRevenue === 0 ? "text-gray-600" : "text-red-600"}>
                              {dailyPuRevenueIsPositive && dailyPuRevenue !== 0 ? "+" : ""}${standardFormat(dailyPuRevenue)}
              </TableCell>
                          </TableRow>
                        );
                      })}
                    </>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-none uppercase [&>th]:text-center">
              <TableHead className="min-w-[120px] !text-left">Date</TableHead>
              {comparisonType === 'actual-vs-snapshot' && (
                <TableHead>Type</TableHead>
              )}
              <TableHead className="!text-right">Rooms</TableHead>
              <TableHead>ADR</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>PU Rooms</TableHead>
              <TableHead>PU ADR</TableHead>
              <TableHead>PU Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allDailyData.map((row: any, i: number) => {
              let puRooms, puADR, puRevenue, puRoomsIsPositive, puADRIsPositive, puRevenueIsPositive;
              
              if (comparisonType === 'actual-vs-snapshot' && row.difference) {
                puRooms = typeof row.difference.puRooms === 'object' ? row.difference.puRooms.value : row.difference.puRooms;
                puADR = typeof row.difference.puADR === 'object' ? row.difference.puADR.value : row.difference.puADR;
                puRevenue = typeof row.difference.puRevenue === 'object' ? row.difference.puRevenue.value : row.difference.puRevenue;
                puRoomsIsPositive = typeof row.difference.puRooms === 'object' ? row.difference.puRooms.isPositive : puRooms >= 0;
                puADRIsPositive = typeof row.difference.puADR === 'object' ? row.difference.puADR.isPositive : puADR >= 0;
                puRevenueIsPositive = typeof row.difference.puRevenue === 'object' ? row.difference.puRevenue.isPositive : puRevenue >= 0;
              } else if (comparisonType === 'stly' && row.difference) {
                puRooms = typeof row.difference.puRooms === 'object' ? row.difference.puRooms.value : row.difference.puRooms;
                puADR = typeof row.difference.puADR === 'object' ? row.difference.puADR.value : row.difference.puADR;
                puRevenue = typeof row.difference.puRevenue === 'object' ? row.difference.puRevenue.value : row.difference.puRevenue;
                puRoomsIsPositive = typeof row.difference.puRooms === 'object' ? row.difference.puRooms.isPositive : puRooms >= 0;
                puADRIsPositive = typeof row.difference.puADR === 'object' ? row.difference.puADR.isPositive : puADR >= 0;
                puRevenueIsPositive = typeof row.difference.puRevenue === 'object' ? row.difference.puRevenue.isPositive : puRevenue >= 0;
              } else {
                puRooms = puADR = puRevenue = 0;
                puRoomsIsPositive = puADRIsPositive = puRevenueIsPositive = true;
              }

              const displayRooms = comparisonType === 'actual-vs-snapshot'
                ? row.snapshot?.rooms || 0
                : row.latest?.rooms || 0;
              
              const displayAdr = comparisonType === 'actual-vs-snapshot'
                ? row.snapshot?.adr || 0
                : row.latest?.adr || 0;
              
              const displayRevenue = comparisonType === 'actual-vs-snapshot'
                ? row.snapshot?.revenue || 0
                : row.latest?.revenue || 0;

              return (
                <TableRow
                  className="text-center text-base font-medium text-dark dark:text-white"
                  key={row.stayDate + i}
                >
                  <TableCell className="!text-left">
                    <div className="font-semibold">{row.stayDate}</div>
                  </TableCell>
                  {comparisonType === 'actual-vs-snapshot' && (
                    <TableCell className="text-xs uppercase">
                      {row.dataType || '-'}
                    </TableCell>
                  )}
                  <TableCell className="!text-right">
                    {standardFormat(displayRooms)}
                  </TableCell>
                  <TableCell>${standardFormat(displayAdr)}</TableCell>
                  <TableCell>${standardFormat(displayRevenue)}</TableCell>
                  <TableCell className={puRoomsIsPositive ? "text-green-600" : puRooms === 0 ? "text-gray-600" : "text-red-600"}>
                    {puRoomsIsPositive && puRooms !== 0 ? "+" : ""}{standardFormat(puRooms)}
                  </TableCell>
                  <TableCell className={puADRIsPositive ? "text-green-600" : puADR === 0 ? "text-gray-600" : "text-red-600"}>
                    {puADRIsPositive && puADR !== 0 ? "+" : ""}${standardFormat(puADR)}
                  </TableCell>
                  <TableCell className={puRevenueIsPositive ? "text-green-600" : puRevenue === 0 ? "text-gray-600" : "text-red-600"}>
                    {puRevenueIsPositive && puRevenue !== 0 ? "+" : ""}${standardFormat(puRevenue)}
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
      )}
    </div>
  );
}
