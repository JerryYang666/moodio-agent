"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import type { CellType } from "@/lib/production-table/types";

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
      if (!open) resetState();
      onOpenChange(open);
    },
    [onOpenChange, resetState]
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
          body.rowCount = rowCount;
        }

        const res = await fetch("/api/production-table/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("Failed to create table");
        const data = await res.json();
        handleOpenChange(false);
        onCreated(data.table.id);
      } catch {
        addToast({ title: t("wizard.failedToCreate"), color: "danger" });
      } finally {
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

  const renderStep3 = () => (
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
                isLoading={creatingMode === "ai"}
                startContent={creatingMode !== "ai" ? <Sparkles size={16} /> : undefined}
                onPress={() => handleCreate("ai")}
              >
                {creatingMode === "ai" ? t("wizard.generating") : t("wizard.createTable")}
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
                max={200}
                value={String(rowCount)}
                onValueChange={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n > 0 && n <= 200) setRowCount(n);
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
      isDismissable={false}
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
