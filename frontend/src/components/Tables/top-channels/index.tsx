import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { compactFormat, standardFormat } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { getTopChannels } from "../fetch";

export async function TopChannels({ className }: { className?: string }) {
  const data = await getTopChannels();

  if (data.length === 0) {
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
          No pickup data available. Make sure you have at least 2 completed snapshots.
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
      <h2 className="mb-4 text-body-2xlg font-bold text-dark dark:text-white">
        Pickup Table
      </h2>

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
          {data.map((row: any, i: number) => (
            <TableRow
              className="text-center text-base font-medium text-dark dark:text-white"
              key={row.month + i}
            >
              <TableCell className="!text-left">
                <div className="">{row.name}</div>
              </TableCell>

              <TableCell>{row.occupancy}%</TableCell>

              <TableCell className="!text-right">
                {standardFormat(row.rooms)}
              </TableCell>

              <TableCell>${standardFormat(row.adr)}</TableCell>

              <TableCell>${standardFormat(row.revenue)}</TableCell>

              <TableCell className={row.puRooms >= 0 ? "text-green-600" : "text-red-600"}>
                {row.puRooms >= 0 ? "+" : ""}{standardFormat(row.puRooms)}
              </TableCell>

              <TableCell className={row.puAdr >= 0 ? "text-green-600" : "text-red-600"}>
                {row.puAdr >= 0 ? "+" : ""}${standardFormat(row.puAdr)}
              </TableCell>

              <TableCell className={row.puRevenue >= 0 ? "text-green-600" : "text-red-600"}>
                {row.puRevenue >= 0 ? "+" : ""}${standardFormat(row.puRevenue)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
