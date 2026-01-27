"use client";

import { useEffect, useMemo, useCallback, useState } from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";
import { Pagination } from "@heroui/pagination";
import { Spinner } from "@heroui/spinner";
import { Button } from "@heroui/button";
import { Select, SelectItem } from "@heroui/select";
import { Chip } from "@heroui/chip";
import { User as UserAvatar } from "@heroui/user";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { RefreshCw, Bean, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { SearchIcon } from "@/components/icons";

interface AdminCreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string | null;
  performedBy: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
  userEmail: string;
  userFirstName: string | null;
  userLastName: string | null;
  performerEmail: string | null;
  performerFirstName: string | null;
  performerLastName: string | null;
}

const TYPE_OPTIONS = [
  { key: "all", label: "All types" },
  { key: "admin_grant", label: "Admin Grant" },
  { key: "video_generation", label: "Video Generation" },
  { key: "image_generation", label: "Image Generation" },
  { key: "refund", label: "Refund" },
  { key: "signup_bonus", label: "Signup Bonus" },
];

function getTypeColor(type: string) {
  switch (type) {
    case "admin_grant":
      return "primary";
    case "video_generation":
    case "image_generation":
      return "warning";
    case "refund":
      return "success";
    case "signup_bonus":
      return "secondary";
    default:
      return "default";
  }
}

function formatAmount(amount: number) {
  const isPositive = amount > 0;
  return {
    value: Math.abs(amount).toLocaleString(),
    isPositive,
    color: isPositive ? "text-success" : "text-danger",
    icon: isPositive ? ArrowUpCircle : ArrowDownCircle,
  };
}

export default function CreditTransactionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<AdminCreditTransaction[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] =
    useState<AdminCreditTransaction | null>(null);

  // Filters
  const [filterValue, setFilterValue] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Pagination
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const data = await api.get("/api/admin/credit-transactions");
      setTransactions(data.transactions ?? []);
    } catch (error) {
      console.error("Failed to fetch credit transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = [...transactions];

    if (typeFilter !== "all") {
      filtered = filtered.filter((t) => t.type === typeFilter);
    }

    if (filterValue) {
      const lowerFilter = filterValue.toLowerCase();
      filtered = filtered.filter((t) => {
        const userName = `${t.userFirstName || ""} ${t.userLastName || ""}`.trim();
        const description = t.description?.toLowerCase() || "";
        return (
          t.id.toLowerCase().includes(lowerFilter) ||
          t.userEmail.toLowerCase().includes(lowerFilter) ||
          userName.toLowerCase().includes(lowerFilter) ||
          description.includes(lowerFilter) ||
          t.type.toLowerCase().includes(lowerFilter)
        );
      });
    }

    return filtered;
  }, [transactions, filterValue, typeFilter]);

  const pages = Math.ceil(filteredItems.length / rowsPerPage);
  const items = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredItems.slice(start, end);
  }, [page, filteredItems, rowsPerPage]);

  // Calculate totals
  const totals = useMemo(() => {
    const credits = filteredItems
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const debits = filteredItems
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    return { credits, debits, net: credits - debits };
  }, [filteredItems]);

  const onSearchChange = useCallback((value?: string) => {
    if (value) {
      setFilterValue(value);
      setPage(1);
    } else {
      setFilterValue("");
    }
  }, []);

  const onClearSearch = useCallback(() => {
    setFilterValue("");
    setPage(1);
  }, []);

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bean size={20} className="text-primary" />
          <h1 className="text-2xl font-bold">Credit Transactions</h1>
        </div>
        <Button
          onPress={fetchTransactions}
          color="primary"
          variant="flat"
          size="sm"
          startContent={<RefreshCw size={16} />}
        >
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardBody className="flex flex-row items-center gap-3">
            <ArrowUpCircle className="text-success" size={24} />
            <div>
              <p className="text-sm text-default-500">Total Credits</p>
              <p className="text-xl font-bold text-success">
                +{totals.credits.toLocaleString()}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-3">
            <ArrowDownCircle className="text-danger" size={24} />
            <div>
              <p className="text-sm text-default-500">Total Debits</p>
              <p className="text-xl font-bold text-danger">
                -{totals.debits.toLocaleString()}
              </p>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex flex-row items-center gap-3">
            <Bean className="text-primary" size={24} />
            <div>
              <p className="text-sm text-default-500">Net Change</p>
              <p
                className={`text-xl font-bold ${totals.net >= 0 ? "text-success" : "text-danger"}`}
              >
                {totals.net >= 0 ? "+" : ""}
                {totals.net.toLocaleString()}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Transaction History</h2>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
              <Input
                isClearable
                className="w-full lg:max-w-[40%]"
                placeholder="Search by user, description, or ID..."
                startContent={<SearchIcon />}
                value={filterValue}
                onClear={() => onClearSearch()}
                onValueChange={onSearchChange}
              />
              <Select
                label="Type"
                selectedKeys={[typeFilter]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string;
                  setTypeFilter(selected || "all");
                  setPage(1);
                }}
                className="w-full lg:max-w-[200px]"
              >
                {TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.key}>{option.label}</SelectItem>
                ))}
              </Select>
              <Select
                label="Rows"
                selectedKeys={[String(rowsPerPage)]}
                onSelectionChange={(keys) => {
                  const selected = Number(Array.from(keys)[0]);
                  setRowsPerPage(selected || 20);
                  setPage(1);
                }}
                className="w-full lg:max-w-[120px]"
              >
                {[10, 20, 50, 100].map((value) => (
                  <SelectItem key={String(value)}>{value}</SelectItem>
                ))}
              </Select>
            </div>

            <Table
              aria-label="Credit transactions table"
              selectionMode="single"
              color="primary"
              onRowAction={(key) => {
                const found = transactions.find((t) => t.id === String(key));
                if (found) setSelectedTransaction(found);
              }}
              bottomContent={
                pages > 0 ? (
                  <div className="flex w-full justify-center">
                    <Pagination
                      isCompact
                      showControls
                      showShadow
                      color="primary"
                      page={page}
                      total={pages}
                      onChange={(page) => setPage(page)}
                    />
                  </div>
                ) : null
              }
            >
              <TableHeader>
                <TableColumn>USER</TableColumn>
                <TableColumn>AMOUNT</TableColumn>
                <TableColumn>TYPE</TableColumn>
                <TableColumn>DESCRIPTION</TableColumn>
                <TableColumn>PERFORMED BY</TableColumn>
                <TableColumn>DATE</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={
                  loading ? <Spinner /> : "No transactions found"
                }
                items={items}
              >
                {(item) => {
                  const amountInfo = formatAmount(item.amount);
                  const AmountIcon = amountInfo.icon;
                  return (
                    <TableRow key={item.id} className="cursor-pointer">
                      <TableCell>
                        <UserAvatar
                          name={
                            item.userFirstName && item.userLastName
                              ? `${item.userFirstName} ${item.userLastName}`
                              : item.userFirstName || item.userEmail
                          }
                          description={item.userEmail}
                          avatarProps={{
                            name: (
                              item.userFirstName?.charAt(0) ||
                              item.userEmail?.charAt(0) ||
                              "?"
                            ).toUpperCase(),
                            color: "primary",
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          className={`flex items-center gap-1 font-medium ${amountInfo.color}`}
                        >
                          <AmountIcon size={16} />
                          <span>
                            {amountInfo.isPositive ? "+" : "-"}
                            {amountInfo.value}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={getTypeColor(item.type)}
                        >
                          {item.type.replace(/_/g, " ")}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-default-600 line-clamp-1">
                          {item.description || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {item.performerEmail ? (
                          <span className="text-sm text-default-500">
                            {item.performerFirstName || item.performerEmail}
                          </span>
                        ) : (
                          <span className="text-sm text-default-400">
                            System
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="light"
                          onPress={() => setSelectedTransaction(item)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                }}
              </TableBody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {/* Transaction Detail Modal */}
      <Modal
        isOpen={!!selectedTransaction}
        onOpenChange={() => setSelectedTransaction(null)}
        size="lg"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Transaction Details</ModalHeader>
              <ModalBody>
                {selectedTransaction && (
                  <div className="space-y-4">
                    {/* Amount Display */}
                    <div className="text-center py-4 bg-default-100 rounded-lg">
                      {(() => {
                        const amountInfo = formatAmount(
                          selectedTransaction.amount
                        );
                        const AmountIcon = amountInfo.icon;
                        return (
                          <div
                            className={`flex items-center justify-center gap-2 ${amountInfo.color}`}
                          >
                            <AmountIcon size={32} />
                            <span className="text-3xl font-bold">
                              {amountInfo.isPositive ? "+" : "-"}
                              {amountInfo.value}
                            </span>
                            <Bean size={24} />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Type */}
                    <div className="flex items-center justify-between">
                      <span className="text-default-500">Type</span>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={getTypeColor(selectedTransaction.type)}
                      >
                        {selectedTransaction.type.replace(/_/g, " ")}
                      </Chip>
                    </div>

                    {/* User */}
                    <div className="flex items-center justify-between">
                      <span className="text-default-500">User</span>
                      <div className="text-right">
                        <p className="font-medium">
                          {selectedTransaction.userFirstName &&
                          selectedTransaction.userLastName
                            ? `${selectedTransaction.userFirstName} ${selectedTransaction.userLastName}`
                            : selectedTransaction.userFirstName ||
                              selectedTransaction.userEmail}
                        </p>
                        <p className="text-sm text-default-400">
                          {selectedTransaction.userEmail}
                        </p>
                      </div>
                    </div>

                    {/* Performed By */}
                    {selectedTransaction.performedBy && (
                      <div className="flex items-center justify-between">
                        <span className="text-default-500">Performed By</span>
                        <div className="text-right">
                          <p className="font-medium">
                            {selectedTransaction.performerFirstName ||
                              selectedTransaction.performerEmail}
                          </p>
                          {selectedTransaction.performerEmail && (
                            <p className="text-sm text-default-400">
                              {selectedTransaction.performerEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {selectedTransaction.description && (
                      <div className="bg-default-100 p-3 rounded-lg">
                        <h4 className="font-medium mb-2 text-sm">Description</h4>
                        <p className="text-sm text-default-600">
                          {selectedTransaction.description}
                        </p>
                      </div>
                    )}

                    {/* Related Entity */}
                    {selectedTransaction.relatedEntityType && (
                      <div className="flex items-center justify-between">
                        <span className="text-default-500">Related To</span>
                        <div className="text-right">
                          <Chip size="sm" variant="bordered">
                            {selectedTransaction.relatedEntityType.replace(
                              /_/g,
                              " "
                            )}
                          </Chip>
                          <p className="text-xs text-default-400 mt-1 font-mono">
                            {selectedTransaction.relatedEntityId}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Date */}
                    <div className="flex items-center justify-between">
                      <span className="text-default-500">Date</span>
                      <span>
                        {new Date(
                          selectedTransaction.createdAt
                        ).toLocaleString()}
                      </span>
                    </div>

                    {/* Transaction ID */}
                    <div className="flex items-center justify-between">
                      <span className="text-default-500">Transaction ID</span>
                      <span className="text-xs font-mono text-default-400">
                        {selectedTransaction.id}
                      </span>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
