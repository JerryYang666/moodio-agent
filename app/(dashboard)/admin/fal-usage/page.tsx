"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardBody } from "@heroui/card";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
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

export default function FalUsagePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FalUsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return format(d, 'PP pp');
    } catch {
        return dateStr;
    }
  };

  const fetchUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/fal-usage");
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
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const getFlattenedRecords = (response: FalUsageResponse | null) => {
    if (!response || !response.time_series) return [];
    
    return response.time_series.flatMap(bucket => 
      bucket.results.map(result => ({
        timestamp: bucket.bucket,
        ...result
      }))
    ).filter(record => record.cost > 0 || record.quantity > 0); // Optional: filter empty records if needed
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button isIconOnly variant="light" onPress={() => router.back()}>
          <ArrowLeft size={20} />
        </Button>
        <h1 className="text-3xl font-bold">Fal Usage & Cost</h1>
      </div>

      {loading && (
        <div className="flex justify-center p-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <Card className="border-danger border">
          <CardBody className="text-danger">
            Error: {error}
          </CardBody>
        </Card>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <h4 className="text-medium font-bold text-default-500">Total Cost (Period)</h4>
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
                          {formatDate(item.timestamp)}
                        </TableCell>
                        <TableCell>{item.endpoint_id}</TableCell>
                        <TableCell>
                          {item.quantity} {item.unit?.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell>${item.cost.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center p-4 text-default-500">
                  {flattenedRecords.length === 0 && data.time_series.length > 0 ? (
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
