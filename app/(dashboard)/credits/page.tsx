"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardBody, CardHeader } from "@heroui/card";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Chip } from "@heroui/chip";
import { Spinner } from "@heroui/spinner";
import { Bean } from "lucide-react";
import { api } from "@/lib/api/client";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

export default function CreditsPage() {
  const t = useTranslations("credits");
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    try {
      const data = await api.get("/api/users/credits");
      setBalance(data.balance);
      setTransactions(data.transactions);
    } catch (error) {
      console.error("Failed to fetch credits:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTransactionTypeLabel = (type: string) => {
    const typeKey = type as keyof typeof t.raw;
    const transactionTypes = t.raw("transactionTypes") as Record<string, string>;
    return transactionTypes[type] || type;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-2">{t("title")}</h1>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
        <CardBody className="py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-primary/20 rounded-full">
              <Bean size={48} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm text-default-500 mb-1">
                {t("currentBalance")}
              </p>
              <p className="text-4xl font-bold text-primary">
                {balance !== null ? balance.toLocaleString() : "0"}
              </p>
              <p className="text-sm text-default-500 mt-1">
                {t("namePlural")}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader className="pb-0 pt-4 px-4 flex-col items-start">
          <h2 className="text-lg font-semibold">{t("transactionHistory")}</h2>
        </CardHeader>
        <CardBody>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-default-400">
              {t("noTransactions")}
            </div>
          ) : (
            <Table aria-label="Transaction history" removeWrapper>
              <TableHeader>
                <TableColumn>{t("date")}</TableColumn>
                <TableColumn>{t("type")}</TableColumn>
                <TableColumn>{t("description")}</TableColumn>
                <TableColumn className="text-right">{t("amount")}</TableColumn>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-default-500 text-sm">
                      {formatDate(tx.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={tx.amount > 0 ? "success" : "warning"}
                      >
                        {getTransactionTypeLabel(tx.type)}
                      </Chip>
                    </TableCell>
                    <TableCell className="text-default-500 text-sm">
                      {tx.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          tx.amount > 0 ? "text-success" : "text-danger"
                        }
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
