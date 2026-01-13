"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardBody } from "@heroui/card";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ArrowLeft, Search, Calendar, Filter } from "lucide-react";
import { useRouter } from "next/navigation";

interface UsageResult {
  endpoint_id: string;
  unit: string;
  quantity: number;
  unit_price: number;
  cost: number;
  currency: string;
}

interface TimeSeriesBucket {
  bucket: string;
  results: UsageResult[];
}

interface FalUsageResponse {
  next_cursor: string | null;
  has_more: boolean;
  time_series: TimeSeriesBucket[];
}

type TimeframeOption = "day" | "week" | "month" | "custom";

const TIMEFRAME_OPTIONS: { key: TimeframeOption; label: string }[] = [
  { key: "day", label: "Last 24 hours" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "Last 30 days" },
  { key: "custom", label: "Custom range" },
];

export default function FalUsagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FalUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [timeframe, setTimeframe] = useState<TimeframeOption>("week");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [endpointId, setEndpointId] = useState<string>("");

  const formatDisplayDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return format(d, "PP pp");
    } catch {
      return dateStr;
    }
  };

  const getDateRange = useCallback(() => {
    const now = new Date();

    switch (timeframe) {
      case "day":
        return {
          start: subDays(now, 1).toISOString(),
          end: now.toISOString(),
        };
      case "week":
        return {
          start: subDays(now, 7).toISOString(),
          end: now.toISOString(),
        };
      case "month":
        return {
          start: subDays(now, 30).toISOString(),
          end: now.toISOString(),
        };
      case "custom":
        return {
          start: startDate ? startOfDay(new Date(startDate)).toISOString() : "",
          end: endDate ? endOfDay(new Date(endDate)).toISOString() : "",
        };
      default:
        return { start: "", end: "" };
    }
  }, [timeframe, startDate, endDate]);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();

      const { start, end } = getDateRange();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (endpointId.trim()) params.set("endpoint_id", endpointId.trim());

      const queryString = params.toString();
      const res = await fetch(
        `/api/admin/fal-usage${queryString ? `?${queryString}` : ""}`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch usage: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, endpointId]);

  useEffect(() => {
    fetchUsage();
  }, []);

  const getFlattenedRecords = (response: FalUsageResponse | null) => {
    if (!response || !response.time_series) return [];

    return response.time_series
      .flatMap((bucket) =>
        bucket.results.map((result) => ({
          timestamp: bucket.bucket,
          ...result,
        }))
      )
      .filter((record) => record.cost > 0 || record.quantity > 0); // Optional: filter empty records if needed
  };

  const calculateTotalCost = (response: FalUsageResponse | null) => {
    if (!response || !response.time_series) return 0;

    let total = 0;
    for (const bucket of response.time_series) {
      for (const result of bucket.results) {
        total += result.cost || 0;
      }
    }
    return total;
  };

  const flattenedRecords = getFlattenedRecords(data);

  const handleApplyFilters = () => {
    fetchUsage();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => router.back()}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-3xl font-bold">Fal Usage & Cost</h1>
      </div>

      {/* Filters Section */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Filter size={18} />
            <h4 className="font-semibold">Filters</h4>
          </div>
        </CardHeader>
        <CardBody className="pt-2">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Timeframe Select */}
              <Select
                label="Time Range"
                selectedKeys={[timeframe]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as TimeframeOption;
                  if (selected) setTimeframe(selected);
                }}
                startContent={
                  <Calendar size={16} className="text-default-400" />
                }
                classNames={{
                  trigger: "min-h-[48px]",
                }}
              >
                {TIMEFRAME_OPTIONS.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>

              {/* Custom Date Range */}
              {timeframe === "custom" && (
                <>
                  <Input
                    type="date"
                    label="Start Date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    classNames={{
                      inputWrapper: "min-h-[48px]",
                    }}
                  />
                  <Input
                    type="date"
                    label="End Date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    classNames={{
                      inputWrapper: "min-h-[48px]",
                    }}
                  />
                </>
              )}

              {/* Endpoint ID Filter */}
              <Input
                label="Endpoint ID"
                placeholder="e.g. fal-ai/flux/dev"
                value={endpointId}
                onChange={(e) => setEndpointId(e.target.value)}
                startContent={<Search size={16} className="text-default-400" />}
                classNames={{
                  inputWrapper: "min-h-[48px]",
                }}
                isClearable
                onClear={() => setEndpointId("")}
              />
            </div>

            <div className="flex justify-end">
              <Button
                color="primary"
                onPress={handleApplyFilters}
                isLoading={loading}
              >
                Apply Filters
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading && (
        <div className="flex justify-center p-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <Card className="border-danger border">
          <CardBody className="text-danger">Error: {error}</CardBody>
        </Card>
      )}

      {data && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <h4 className="text-medium font-bold text-default-500">
                  Total Cost (Period)
                </h4>
              </CardHeader>
              <CardBody className="pt-0">
                <span className="text-2xl font-bold">
                  ${calculateTotalCost(data).toFixed(4)}
                </span>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h4 className="font-bold text-lg">Usage Records</h4>
            </CardHeader>
            <CardBody>
              {flattenedRecords.length > 0 ? (
                <Table aria-label="Fal Usage Table">
                  <TableHeader>
                    <TableColumn>Date</TableColumn>
                    <TableColumn>Endpoint / Model</TableColumn>
                    <TableColumn>Units</TableColumn>
                    <TableColumn>Cost</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {flattenedRecords.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {formatDisplayDate(item.timestamp)}
                        </TableCell>
                        <TableCell>{item.endpoint_id}</TableCell>
                        <TableCell>
                          {item.quantity} {item.unit?.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell>${item.cost.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-4 text-default-500">
                  {flattenedRecords.length === 0 &&
                  (data.time_series?.length ?? 0) > 0 ? (
                    "No usage recorded in this period."
                  ) : (
                    <div className="max-h-[500px] overflow-auto text-left">
                      <pre className="text-xs bg-default-100 p-4 rounded-lg">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
