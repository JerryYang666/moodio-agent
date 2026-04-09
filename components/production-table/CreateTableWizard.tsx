"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Checkbox } from "@heroui/checkbox";
import { Chip } from "@heroui/chip";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileUp,
  Table2,
  Check,
  FileText,
  TriangleAlert,
} from "lucide-react";
import { MAX_PRODUCTION_TABLE_ROWS, type CellType } from "@/lib/production-table/types";

interface PresetColumn {
  key: string;
  cellType: CellType;
}

const PRESET_COLUMNS: PresetColumn[] = [
  { key: "shotNumber", cellType: "text" },
  { key: "visualContent", cellType: "text" },
  { key: "shotSize", cellType: "text" },
  { key: "cameraMovement", cellType: "text" },
  { key: "cameraAngle", cellType: "text" },
  { key: "dialogue", cellType: "text" },
  { key: "characterRef", cellType: "media" },
  { key: "sceneRef", cellType: "media" },
  { key: "keyframeRef", cellType: "media" },
  { key: "videoPrompt", cellType: "text" },
  { key: "generatedVideoRef", cellType: "media" },
];

const AI_STEP_KEYS = [
  "aiStep1",
  "aiStep2",
  "aiStep3",
  "aiStep4",
  "aiStep5",
  "aiStep6",
  "aiStep7",
  "aiStep8",
  "aiStep9",
] as const;

const STEP_INTERVAL_MS = 4000;

interface CreateTableWizardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tableId: string) => void;
}

export default function CreateTableWizard({
  isOpen,
  onOpenChange,
  onCreated,
}: CreateTableWizardProps) {
  const t = useTranslations("productionTable");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tableName, setTableName] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(
    () => new Set(PRESET_COLUMNS.map((c) => c.key))
  );

  // Step 3 state
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [scriptFileName, setScriptFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [rowCount, setRowCount] = useState(10);
  const [creatingMode, setCreatingMode] = useState<"ai" | "scratch" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI loading animation state
  const [aiStepIndex, setAiStepIndex] = useState(0);

  useEffect(() => {
    if (creatingMode !== "ai") {
      setAiStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setAiStepIndex((prev) =>
        prev < AI_STEP_KEYS.length - 1 ? prev + 1 : prev
      );
    }, STEP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [creatingMode]);

  // Warn user before leaving during AI generation
  useEffect(() => {
    if (creatingMode !== "ai") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [creatingMode]);

  const resetState = useCallback(() => {
    setStep(1);
    setTableName("");
    setSelectedColumns(new Set(PRESET_COLUMNS.map((c) => c.key)));
    setScriptText(null);
    setScriptFileName(null);
    setIsParsing(false);
    setRowCount(10);
    setCreatingMode(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && creatingMode !== null) return;
      if (!open) resetState();
      onOpenChange(open);
    },
    [onOpenChange, resetState, creatingMode]
  );

  const toggleColumn = useCallback((key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleFileUpload = useCallback(
    async (file: File) => {
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        addToast({ title: t("wizard.failedToParse"), color: "danger" });
        return;
      }

      setIsParsing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-document", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Parse failed");
        const { text } = await res.json();
        setScriptText(text);
        setScriptFileName(file.name);
      } catch {
        addToast({ title: t("wizard.failedToParse"), color: "danger" });
        setScriptText(null);
        setScriptFileName(null);
      } finally {
        setIsParsing(false);
      }
    },
    [t]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
      e.target.value = "";
    },
    [handleFileUpload]
  );

  const buildColumns = useCallback(() => {
    return PRESET_COLUMNS.filter((c) => selectedColumns.has(c.key)).map(
      (c) => ({
        name: t(`wizard.col.${c.key}`),
        cellType: c.cellType,
      })
    );
  }, [selectedColumns, t]);

  const handleCreate = useCallback(
    async (mode: "ai" | "scratch") => {
      setCreatingMode(mode);
      try {
        const body: Record<string, unknown> = {
          name: tableName.trim(),
          columns: buildColumns(),
          mode,
        };

        if (mode === "ai") {
          body.scriptText = scriptText;
        } else {
          body.rowCount = Math.min(rowCount, MAX_PRODUCTION_TABLE_ROWS);
        }

        const res = await fetch("/api/production-table/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("Failed to create table");
        const data = await res.json();
        setCreatingMode(null);
        handleOpenChange(false);
        onCreated(data.table.id);
      } catch {
        addToast({ title: t("wizard.failedToCreate"), color: "danger" });
        setCreatingMode(null);
      }
    },
    [tableName, buildColumns, scriptText, rowCount, handleOpenChange, onCreated, t]
  );

  const renderStep1 = () => (
    <>
      <ModalBody>
        <Input
          autoFocus
          label={t("wizard.tableName")}
          value={tableName}
          onValueChange={setTableName}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tableName.trim()) setStep(2);
          }}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="flat" onPress={() => handleOpenChange(false)}>
          Cancel
        </Button>
        <Button
          color="primary"
          isDisabled={!tableName.trim()}
          endContent={<ArrowRight size={16} />}
          onPress={() => setStep(2)}
        >
          {t("wizard.next")}
        </Button>
      </ModalFooter>
    </>
  );

  const renderStep2 = () => (
    <>
      <ModalBody>
        <p className="text-sm text-default-500 mb-2">
          {t("wizard.selectColumnsDesc")}
        </p>
        <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
          {PRESET_COLUMNS.map((col) => (
            <div
              key={col.key}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-default-100 transition-colors cursor-pointer"
              onClick={() => toggleColumn(col.key)}
            >
              <Checkbox
                isSelected={selectedColumns.has(col.key)}
                onValueChange={() => toggleColumn(col.key)}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">
                  {t(`wizard.col.${col.key}`)}
                </span>
                <p className="text-xs text-default-400 truncate">
                  {t(`wizard.colDesc.${col.key}`)}
                </p>
              </div>
              <Chip
                size="sm"
                variant="flat"
                color={col.cellType === "text" ? "default" : "secondary"}
              >
                {col.cellType === "text" ? t("textCell") : t("mediaCell")}
              </Chip>
            </div>
          ))}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="flat"
          startContent={<ArrowLeft size={16} />}
          onPress={() => setStep(1)}
        >
          {t("wizard.back")}
        </Button>
        <Button
          color="primary"
          isDisabled={selectedColumns.size === 0}
          endContent={<ArrowRight size={16} />}
          onPress={() => setStep(3)}
        >
          {t("wizard.next")}
        </Button>
      </ModalFooter>
    </>
  );

  const renderAiLoadingOverlay = () => {
    const progress = Math.min(
      95,
      ((aiStepIndex + 1) / AI_STEP_KEYS.length) * 90 + 5
    );

    return (
      <>
        <ModalBody>
          <div className="flex flex-col items-center justify-center gap-6 py-10">
            {/* Animated sparkle icon */}
            <div className="relative flex items-center justify-center">
              <div className="absolute w-20 h-20 rounded-full bg-primary/10 animate-ping" />
              <div className="relative w-16 h-16 rounded-full bg-linear-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <Sparkles
                  size={28}
                  className="text-primary animate-pulse"
                />
              </div>
            </div>

            {/* Status text with crossfade */}
            <div className="text-center min-h-[56px] flex flex-col items-center gap-2">
              <p
                key={aiStepIndex}
                className="text-lg font-semibold animate-fade-in-up"
              >
                {t(`wizard.${AI_STEP_KEYS[aiStepIndex]}`)}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full max-w-xs">
              <div className="h-1.5 w-full rounded-full bg-default-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-primary to-secondary transition-all duration-1000 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Completed steps */}
            <div className="flex flex-col gap-1.5 w-full max-w-xs">
              {AI_STEP_KEYS.map((key, i) => {
                if (i > aiStepIndex) return null;
                const isCurrent = i === aiStepIndex;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 text-xs transition-opacity duration-300 ${
                      isCurrent ? "opacity-100" : "opacity-40"
                    }`}
                  >
                    {isCurrent ? (
                      <Spinner size="sm" classNames={{ wrapper: "w-3.5 h-3.5" }} />
                    ) : (
                      <Check size={14} className="text-success shrink-0" />
                    )}
                    <span className={isCurrent ? "font-medium" : ""}>
                      {t(`wizard.${key}`)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Do not leave warning */}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-warning-50 dark:bg-warning-50/10 border border-warning-200 dark:border-warning-200/20">
              <TriangleAlert
                size={16}
                className="text-warning shrink-0"
              />
              <p className="text-xs text-warning-700 dark:text-warning-400">
                {t("wizard.doNotLeave")}
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter />
      </>
    );
  };

  const renderStep3 = () => {
    if (creatingMode === "ai") {
      return renderAiLoadingOverlay();
    }

    return (
    <>
      <ModalBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AI from Script */}
          <Card
            className="border-2 border-default-200 hover:border-primary transition-colors"
          >
            <CardBody className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-primary" />
                <span className="font-semibold text-sm">
                  {t("wizard.aiFromScript")}
                </span>
              </div>
              <p className="text-xs text-default-400">
                {t("wizard.aiFromScriptDesc")}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileInputChange}
              />

              {!scriptText && !isParsing && (
                <Button
                  variant="flat"
                  className="w-full"
                  startContent={<FileUp size={16} />}
                  onPress={() => fileInputRef.current?.click()}
                >
                  {t("wizard.uploadScript")}
                </Button>
              )}

              {isParsing && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-default-100">
                  <Spinner size="sm" />
                  <span className="text-sm">{t("wizard.parsing")}</span>
                </div>
              )}

              {scriptText && !isParsing && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 dark:bg-success-50/10">
                  <Check size={16} className="text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-default-500 shrink-0" />
                      <span className="text-sm font-medium truncate">
                        {scriptFileName}
                      </span>
                    </div>
                    <p className="text-xs text-default-400 mt-1 line-clamp-2">
                      {scriptText.slice(0, 150)}...
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="light"
                    isIconOnly
                    onPress={() => {
                      setScriptText(null);
                      setScriptFileName(null);
                    }}
                  >
                    ×
                  </Button>
                </div>
              )}

              <p className="text-xs text-default-300">
                {t("wizard.uploadScriptFormats")}
              </p>

              <Button
                color="primary"
                className="w-full mt-auto"
                isDisabled={!scriptText || creatingMode !== null}
                startContent={<Sparkles size={16} />}
                onPress={() => handleCreate("ai")}
              >
                {t("wizard.createTable")}
              </Button>
            </CardBody>
          </Card>

          {/* Start from Scratch */}
          <Card
            className="border-2 border-default-200 hover:border-default-400 transition-colors"
          >
            <CardBody className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2">
                <Table2 size={18} className="text-default-600" />
                <span className="font-semibold text-sm">
                  {t("wizard.startFromScratch")}
                </span>
              </div>
              <p className="text-xs text-default-400">
                {t("wizard.startFromScratchDesc")}
              </p>

              <Input
                type="number"
                label={t("wizard.rowCount")}
                min={1}
                max={MAX_PRODUCTION_TABLE_ROWS}
                value={String(rowCount)}
                onValueChange={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n > 0 && n <= MAX_PRODUCTION_TABLE_ROWS) {
                    setRowCount(n);
                  }
                }}
              />

              <Button
                color="default"
                variant="flat"
                className="w-full mt-auto"
                isDisabled={creatingMode !== null}
                isLoading={creatingMode === "scratch"}
                onPress={() => handleCreate("scratch")}
              >
                {t("wizard.createTable")}
              </Button>
            </CardBody>
          </Card>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="flat"
          startContent={<ArrowLeft size={16} />}
          onPress={() => setStep(2)}
          isDisabled={creatingMode !== null}
        >
          {t("wizard.back")}
        </Button>
      </ModalFooter>
    </>
    );
  };

  const stepTitles: Record<1 | 2 | 3, string> = {
    1: t("wizard.step1Title"),
    2: t("wizard.step2Title"),
    3: t("wizard.step3Title"),
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      size={step === 3 ? "3xl" : "lg"}
      scrollBehavior="inside"
      isDismissable={creatingMode === null}
      hideCloseButton={creatingMode !== null}
    >
      <ModalContent>
        <ModalHeader className="flex-col gap-3">
          <div className="flex items-center justify-center w-full">
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                      s === step
                        ? "bg-primary text-primary-foreground"
                        : s < step
                          ? "bg-success text-success-foreground"
                          : "bg-default-200 text-default-500"
                    }`}
                  >
                    {s < step ? <Check size={12} /> : s}
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap ${
                      s === step
                        ? "text-primary font-semibold"
                        : s < step
                          ? "text-success font-medium"
                          : "text-default-400"
                    }`}
                  >
                    {stepTitles[s]}
                  </span>
                </div>
                {s < 3 && (
                  <div
                    className={`w-12 h-0.5 mx-2 mb-5 ${
                      s < step ? "bg-success" : "bg-default-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </ModalHeader>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ModalContent>
    </Modal>
  );
}
