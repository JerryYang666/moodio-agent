"use client";

import { useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Button } from "@heroui/button";
import { Input, Textarea } from "@heroui/input";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { addToast } from "@heroui/toast";
import { api } from "@/lib/api/client";
import { formatStatementDescriptorPreview } from "@/lib/statement-descriptor";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Edit, CreditCard, Package, Activity, Search, Eye } from "lucide-react";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  stripePriceId: string;
  priceCents: number;
  interval: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  stripePriceId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface StripeEventRow {
  id: string;
  stripeEventId: string;
  eventType: string;
  userId: string | null;
  userEmail: string | null;
  stripeCustomerId: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

export default function StripeAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("admin.stripe");
  const tCommon = useTranslations("common");

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [loading, setLoading] = useState(true);

  // Plan modal
  const {
    isOpen: isPlanOpen,
    onOpen: onPlanOpen,
    onOpenChange: onPlanOpenChange,
    onClose: onPlanClose,
  } = useDisclosure();
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: "",
    description: "",
    stripePriceId: "",
    priceCents: "",
    interval: "month",
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Package modal
  const {
    isOpen: isPkgOpen,
    onOpen: onPkgOpen,
    onOpenChange: onPkgOpenChange,
    onClose: onPkgClose,
  } = useDisclosure();
  const [editingPkg, setEditingPkg] = useState<CreditPackage | null>(null);
  const [pkgForm, setPkgForm] = useState({
    name: "",
    credits: "",
    priceCents: "",
    stripePriceId: "",
    sortOrder: "0",
  });
  const [savingPkg, setSavingPkg] = useState(false);

  // Event log state
  const [events, setEvents] = useState<StripeEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventSearch, setEventSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [eventPage, setEventPage] = useState(1);
  const eventsPerPage = 15;
  const {
    isOpen: isEventDetailOpen,
    onOpen: onEventDetailOpen,
    onOpenChange: onEventDetailOpenChange,
  } = useDisclosure();
  const [selectedEvent, setSelectedEvent] = useState<StripeEventRow | null>(null);

  useEffect(() => {
    if (user?.roles.includes("admin")) {
      fetchAll();
    }
  }, [user]);

  const fetchAll = async () => {
    setLoading(true);
    setEventsLoading(true);
    try {
      const [planData, pkgData, eventData] = await Promise.all([
        api.get("/api/admin/subscription-plans"),
        api.get("/api/admin/credit-packages"),
        api.get("/api/admin/stripe-events"),
      ]);
      setPlans(planData);
      setPackages(pkgData);
      setEvents(eventData);
    } catch {
      addToast({ title: "Failed to load Stripe configuration", color: "danger" });
    } finally {
      setLoading(false);
      setEventsLoading(false);
    }
  };

  // --- Subscription Plans ---

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanForm({ name: "", description: "", stripePriceId: "", priceCents: "", interval: "month" });
    onPlanOpen();
  };

  const openEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description ?? "",
      stripePriceId: plan.stripePriceId,
      priceCents: String(plan.priceCents),
      interval: plan.interval,
    });
    onPlanOpen();
  };

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      if (editingPlan) {
        await api.put("/api/admin/subscription-plans", {
          id: editingPlan.id,
          name: planForm.name,
          description: planForm.description || null,
          stripePriceId: planForm.stripePriceId,
          priceCents: Number(planForm.priceCents),
          interval: planForm.interval,
        });
      } else {
        await api.post("/api/admin/subscription-plans", {
          name: planForm.name,
          description: planForm.description || null,
          stripePriceId: planForm.stripePriceId,
          priceCents: Number(planForm.priceCents),
          interval: planForm.interval,
        });
      }
      await fetchAll();
      onPlanClose();
      addToast({ title: t("planSaved"), color: "success" });
    } catch (error: any) {
      addToast({ title: error.message || "Failed to save plan", color: "danger" });
    } finally {
      setSavingPlan(false);
    }
  };

  const handleTogglePlan = async (plan: SubscriptionPlan) => {
    try {
      await api.put("/api/admin/subscription-plans", {
        id: plan.id,
        isActive: !plan.isActive,
      });
      await fetchAll();
    } catch {
      addToast({ title: "Failed to update plan", color: "danger" });
    }
  };

  // --- Credit Packages ---

  const openNewPkg = () => {
    setEditingPkg(null);
    setPkgForm({ name: "", credits: "", priceCents: "", stripePriceId: "", sortOrder: "0" });
    onPkgOpen();
  };

  const openEditPkg = (pkg: CreditPackage) => {
    setEditingPkg(pkg);
    setPkgForm({
      name: pkg.name,
      credits: String(pkg.credits),
      priceCents: String(pkg.priceCents),
      stripePriceId: pkg.stripePriceId,
      sortOrder: String(pkg.sortOrder),
    });
    onPkgOpen();
  };

  const handleSavePkg = async () => {
    setSavingPkg(true);
    try {
      if (editingPkg) {
        await api.put("/api/admin/credit-packages", {
          id: editingPkg.id,
          name: pkgForm.name,
          credits: Number(pkgForm.credits),
          priceCents: Number(pkgForm.priceCents),
          stripePriceId: pkgForm.stripePriceId,
          sortOrder: Number(pkgForm.sortOrder),
        });
      } else {
        await api.post("/api/admin/credit-packages", {
          name: pkgForm.name,
          credits: Number(pkgForm.credits),
          priceCents: Number(pkgForm.priceCents),
          stripePriceId: pkgForm.stripePriceId,
          sortOrder: Number(pkgForm.sortOrder),
        });
      }
      await fetchAll();
      onPkgClose();
      addToast({ title: t("packageSaved"), color: "success" });
    } catch (error: any) {
      addToast({ title: error.message || "Failed to save package", color: "danger" });
    } finally {
      setSavingPkg(false);
    }
  };

  const handleTogglePkg = async (pkg: CreditPackage) => {
    try {
      await api.put("/api/admin/credit-packages", {
        id: pkg.id,
        isActive: !pkg.isActive,
      });
      await fetchAll();
    } catch {
      addToast({ title: "Failed to update package", color: "danger" });
    }
  };

  // --- Derived state (hooks must be called unconditionally) ---

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.eventType))).sort(),
    [events]
  );

  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (eventTypeFilter !== "all") {
      filtered = filtered.filter((e) => e.eventType === eventTypeFilter);
    }
    if (eventSearch) {
      const q = eventSearch.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.stripeEventId.toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q) ||
          e.userEmail?.toLowerCase().includes(q) ||
          e.stripeCustomerId?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [events, eventTypeFilter, eventSearch]);

  const eventPages = Math.ceil(filteredEvents.length / eventsPerPage);
  const eventItems = useMemo(() => {
    const start = (eventPage - 1) * eventsPerPage;
    return filteredEvents.slice(start, start + eventsPerPage);
  }, [eventPage, filteredEvents]);

  const eventTypeColor = (type: string): "success" | "primary" | "warning" | "danger" | "default" => {
    if (type.includes("deleted") || type.includes("failed")) return "danger";
    if (type.includes("created")) return "success";
    if (type.includes("updated")) return "warning";
    if (type.includes("completed")) return "primary";
    return "default";
  };

  // --- Render ---

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-default-500">{t("description")}</p>
      </div>

      {/* Subscription Plans */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-primary" />
            <h2 className="text-lg font-semibold">{t("subscriptionPlans")}</h2>
          </div>
          <Button
            size="sm"
            color="primary"
            startContent={<Plus size={14} />}
            onPress={openNewPlan}
          >
            {t("addPlan")}
          </Button>
        </CardHeader>
        <CardBody>
          <Table aria-label="Subscription plans" removeWrapper>
            <TableHeader>
              <TableColumn>{t("planName")}</TableColumn>
              <TableColumn>{t("stripePriceId")}</TableColumn>
              <TableColumn>{t("price")}</TableColumn>
              <TableColumn>{t("interval")}</TableColumn>
              <TableColumn>{t("status")}</TableColumn>
              <TableColumn>{t("actions")}</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : t("noPlans")}
              items={plans}
            >
              {(plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{plan.name}</p>
                      {plan.description && (
                        <p className="text-xs text-default-400 truncate max-w-[200px]">
                          {plan.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                      {plan.stripePriceId}
                    </code>
                  </TableCell>
                  <TableCell>{formatPrice(plan.priceCents)}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat">
                      {plan.interval}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <Switch
                      size="sm"
                      isSelected={plan.isActive}
                      onValueChange={() => handleTogglePlan(plan)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="flat"
                      isIconOnly
                      onPress={() => openEditPlan(plan)}
                    >
                      <Edit size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Credit Packages */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-primary" />
            <h2 className="text-lg font-semibold">{t("creditPackages")}</h2>
          </div>
          <Button
            size="sm"
            color="primary"
            startContent={<Plus size={14} />}
            onPress={openNewPkg}
          >
            {t("addPackage")}
          </Button>
        </CardHeader>
        <CardBody>
          <Table aria-label="Credit packages" removeWrapper>
            <TableHeader>
              <TableColumn>{t("packageName")}</TableColumn>
              <TableColumn>{t("credits")}</TableColumn>
              <TableColumn>{t("price")}</TableColumn>
              <TableColumn>{t("stripePriceId")}</TableColumn>
              <TableColumn>{t("order")}</TableColumn>
              <TableColumn>{t("status")}</TableColumn>
              <TableColumn>{t("actions")}</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : t("noPackages")}
              items={packages}
            >
              {(pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color="primary">
                      {pkg.credits.toLocaleString()}
                    </Chip>
                  </TableCell>
                  <TableCell>{formatPrice(pkg.priceCents)}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                      {pkg.stripePriceId}
                    </code>
                  </TableCell>
                  <TableCell className="text-default-500">{pkg.sortOrder}</TableCell>
                  <TableCell>
                    <Switch
                      size="sm"
                      isSelected={pkg.isActive}
                      onValueChange={() => handleTogglePkg(pkg)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="flat"
                      isIconOnly
                      onPress={() => openEditPkg(pkg)}
                    >
                      <Edit size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Subscription Plan Modal */}
      <Modal isOpen={isPlanOpen} onOpenChange={onPlanOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingPlan ? t("editPlan") : t("addPlan")}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label={t("planName")}
                    placeholder="e.g. Browse Pro"
                    value={planForm.name}
                    onValueChange={(v) => setPlanForm({ ...planForm, name: v })}
                    isRequired
                  />
                  <Textarea
                    label={t("planDescription")}
                    placeholder="Describe what this plan includes..."
                    value={planForm.description}
                    onValueChange={(v) => setPlanForm({ ...planForm, description: v })}
                    minRows={2}
                  />
                  <Input
                    label={t("stripePriceId")}
                    placeholder="price_..."
                    value={planForm.stripePriceId}
                    onValueChange={(v) => setPlanForm({ ...planForm, stripePriceId: v })}
                    description={t("stripePriceIdHelp")}
                    classNames={{ input: "font-mono" }}
                    isRequired
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label={t("priceCents")}
                      placeholder="999"
                      type="number"
                      value={planForm.priceCents}
                      onValueChange={(v) => setPlanForm({ ...planForm, priceCents: v })}
                      description={planForm.priceCents ? formatPrice(Number(planForm.priceCents)) : undefined}
                      isRequired
                    />
                    <Select
                      label={t("interval")}
                      selectedKeys={[planForm.interval]}
                      onSelectionChange={(keys) => {
                        const val = Array.from(keys)[0] as string;
                        if (val) setPlanForm({ ...planForm, interval: val });
                      }}
                    >
                      <SelectItem key="month">Monthly</SelectItem>
                      <SelectItem key="year">Yearly</SelectItem>
                      <SelectItem key="week">Weekly</SelectItem>
                    </Select>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSavePlan}
                  isLoading={savingPlan}
                  isDisabled={!planForm.name || !planForm.stripePriceId || !planForm.priceCents}
                >
                  {tCommon("save")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Credit Package Modal */}
      <Modal isOpen={isPkgOpen} onOpenChange={onPkgOpenChange} size="lg">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingPkg ? t("editPackage") : t("addPackage")}
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Input
                    label={t("packageName")}
                    placeholder="e.g. 500 Credits"
                    value={pkgForm.name}
                    onValueChange={(v) => setPkgForm({ ...pkgForm, name: v })}
                    description={pkgForm.name ? `Card statement: ${formatStatementDescriptorPreview(pkgForm.name)}` : undefined}
                    isRequired
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label={t("credits")}
                      placeholder="500"
                      type="number"
                      value={pkgForm.credits}
                      onValueChange={(v) => setPkgForm({ ...pkgForm, credits: v })}
                      isRequired
                    />
                    <Input
                      label={t("priceCents")}
                      placeholder="499"
                      type="number"
                      value={pkgForm.priceCents}
                      onValueChange={(v) => setPkgForm({ ...pkgForm, priceCents: v })}
                      description={pkgForm.priceCents ? formatPrice(Number(pkgForm.priceCents)) : undefined}
                      isRequired
                    />
                  </div>
                  <Input
                    label={t("stripePriceId")}
                    placeholder="price_..."
                    value={pkgForm.stripePriceId}
                    onValueChange={(v) => setPkgForm({ ...pkgForm, stripePriceId: v })}
                    description={t("stripePriceIdHelp")}
                    classNames={{ input: "font-mono" }}
                    isRequired
                  />
                  <Input
                    label={t("sortOrder")}
                    placeholder="0"
                    type="number"
                    value={pkgForm.sortOrder}
                    onValueChange={(v) => setPkgForm({ ...pkgForm, sortOrder: v })}
                    description={t("sortOrderHelp")}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSavePkg}
                  isLoading={savingPkg}
                  isDisabled={!pkgForm.name || !pkgForm.credits || !pkgForm.priceCents || !pkgForm.stripePriceId}
                >
                  {tCommon("save")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Stripe Event Log */}
      <Card>
        <CardHeader className="flex-col items-start gap-3">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-primary" />
              <h2 className="text-lg font-semibold">{t("eventLog")}</h2>
            </div>
            <Chip size="sm" variant="flat">
              {filteredEvents.length} {t("events")}
            </Chip>
          </div>
          <div className="flex flex-wrap gap-3 w-full">
            <Input
              size="sm"
              placeholder={t("searchEvents")}
              value={eventSearch}
              onValueChange={(v) => { setEventSearch(v); setEventPage(1); }}
              startContent={<Search size={14} />}
              className="max-w-xs"
            />
            <Select
              size="sm"
              selectedKeys={[eventTypeFilter]}
              onSelectionChange={(keys) => {
                const val = Array.from(keys)[0] as string;
                if (val) { setEventTypeFilter(val); setEventPage(1); }
              }}
              className="max-w-[250px]"
              items={[{ key: "all", label: t("allTypes") }, ...eventTypes.map((type) => ({ key: type, label: type }))]}
            >
              {(item) => <SelectItem key={item.key}>{item.label}</SelectItem>}
            </Select>
          </div>
        </CardHeader>
        <CardBody>
          <Table
            aria-label="Stripe events"
            removeWrapper
            onRowAction={(key) => {
              const evt = events.find((e) => e.id === key);
              if (evt) { setSelectedEvent(evt); onEventDetailOpen(); }
            }}
            selectionMode="single"
            bottomContent={
              eventPages > 1 ? (
                <div className="flex w-full justify-center">
                  <Pagination
                    isCompact
                    showControls
                    showShadow
                    color="primary"
                    page={eventPage}
                    total={eventPages}
                    onChange={setEventPage}
                  />
                </div>
              ) : null
            }
          >
            <TableHeader>
              <TableColumn>{t("eventTime")}</TableColumn>
              <TableColumn>{t("eventType")}</TableColumn>
              <TableColumn>{t("eventUser")}</TableColumn>
              <TableColumn>{t("eventCustomer")}</TableColumn>
              <TableColumn>{t("actions")}</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={eventsLoading ? <Spinner /> : t("noEvents")}
              items={eventItems}
            >
              {(evt) => (
                <TableRow key={evt.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(evt.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Chip size="sm" variant="flat" color={eventTypeColor(evt.eventType)}>
                      {evt.eventType}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    {evt.userEmail ? (
                      <span className="text-sm">{evt.userEmail}</span>
                    ) : evt.userId ? (
                      <code className="text-xs text-default-400">{evt.userId.slice(0, 8)}...</code>
                    ) : (
                      <span className="text-default-300">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {evt.stripeCustomerId ? (
                      <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                        {evt.stripeCustomerId}
                      </code>
                    ) : (
                      <span className="text-default-300">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="flat"
                      isIconOnly
                      onPress={() => { setSelectedEvent(evt); onEventDetailOpen(); }}
                    >
                      <Eye size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Event Detail Modal */}
      <Modal isOpen={isEventDetailOpen} onOpenChange={onEventDetailOpenChange} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex-col items-start">
                <span>{selectedEvent?.eventType}</span>
                <span className="text-xs text-default-400 font-mono font-normal">
                  {selectedEvent?.stripeEventId}
                </span>
              </ModalHeader>
              <ModalBody>
                {selectedEvent && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-default-500">{t("eventTime")}</p>
                        <p>{new Date(selectedEvent.createdAt).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-default-500">{t("eventUser")}</p>
                        <p>{selectedEvent.userEmail || selectedEvent.userId || "-"}</p>
                      </div>
                      <div>
                        <p className="text-default-500">{t("eventCustomer")}</p>
                        <p className="font-mono text-xs">{selectedEvent.stripeCustomerId || "-"}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-default-500 text-sm mb-2">{t("eventMetadata")}</p>
                      <pre className="text-xs bg-default-100 p-3 rounded-lg overflow-auto max-h-96 font-mono">
                        {JSON.stringify(selectedEvent.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("close")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
