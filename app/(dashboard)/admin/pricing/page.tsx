"use client";

import { useEffect, useState } from "react";
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
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import {
  Accordion,
  AccordionItem,
} from "@heroui/accordion";
import { Select, SelectItem } from "@heroui/select";
import { Switch } from "@heroui/switch";
import { api } from "@/lib/api/client";
import { useAuth } from "@/hooks/use-auth";
import { Spinner } from "@heroui/spinner";
import { addToast } from "@heroui/toast";
import { Calculator, Check, X, Trash2, Edit, Info, Copy, BookOpen } from "lucide-react";

interface ModelParam {
  name: string;
  type: string;
  options?: (string | number)[];
  default?: string | number | boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  params: ModelParam[];
}

interface PricingFormula {
  id: string;
  modelId: string;
  formula: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function PricingPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("admin.pricing");
  const tCommon = useTranslations("common");

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [formulas, setFormulas] = useState<PricingFormula[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit Modal State
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onOpenChange: onEditOpenChange,
    onClose: onEditClose,
  } = useDisclosure();
  
  // Examples Modal State
  const {
    isOpen: isExamplesOpen,
    onOpen: onExamplesOpen,
    onOpenChange: onExamplesOpenChange,
  } = useDisclosure();
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null);
  const [formula, setFormula] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Validation State
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
    testResult?: number;
  } | null>(null);
  const [testParams, setTestParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user && user.roles.includes("admin")) {
      fetchPricing();
    }
  }, [user]);

  const fetchPricing = async () => {
    try {
      const data = await api.get("/api/admin/pricing");
      setModels(data.models);
      setFormulas(data.formulas);
    } catch (error) {
      console.error("Failed to fetch pricing:", error);
      addToast({
        title: "Error",
        description: "Failed to fetch pricing data",
        color: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  const getFormulaForModel = (modelId: string): PricingFormula | undefined => {
    return formulas.find((f) => f.modelId === modelId);
  };

  const handleEditModel = (model: ModelInfo) => {
    setSelectedModel(model);
    const existingFormula = getFormulaForModel(model.id);
    setFormula(existingFormula?.formula || "");
    setDescription(existingFormula?.description || "");
    setValidationResult(null);
    // Initialize test params with defaults
    const defaultParams: Record<string, string> = {};
    model.params.forEach((p) => {
      if (p.default !== undefined) {
        defaultParams[p.name] = String(p.default);
      } else if (p.options && p.options.length > 0) {
        defaultParams[p.name] = String(p.options[0]);
      }
    });
    setTestParams(defaultParams);
    onEditOpen();
  };

  const handleValidate = async () => {
    if (!formula.trim()) return;
    setValidating(true);
    try {
      // Convert test params to proper types
      const typedParams: Record<string, any> = {};
      if (selectedModel) {
        selectedModel.params.forEach((p) => {
          const value = testParams[p.name];
          if (value === undefined || value === "") return;

          if (p.type === "boolean") {
            typedParams[p.name] = value === "true";
          } else if (p.type === "number") {
            typedParams[p.name] = parseFloat(value);
          } else {
            typedParams[p.name] = value;
          }
        });
      }

      const result = await api.post("/api/admin/pricing/validate", {
        formula,
        testParams: typedParams,
      });
      setValidationResult(result);
    } catch (error: any) {
      setValidationResult({
        valid: false,
        error: error.message || "Validation failed",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedModel || !formula.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/admin/pricing", {
        modelId: selectedModel.id,
        formula,
        description: description || null,
      });
      await fetchPricing();
      onEditClose();
      addToast({
        title: tCommon("success"),
        description: t("saveSuccess"),
        color: "success",
      });
    } catch (error: any) {
      addToast({
        title: tCommon("error"),
        description: error.message || "Failed to save formula",
        color: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      await api.delete(`/api/admin/pricing/${encodeURIComponent(modelId)}`);
      await fetchPricing();
      addToast({
        title: tCommon("success"),
        description: t("deleteSuccess"),
        color: "success",
      });
    } catch (error: any) {
      addToast({
        title: tCommon("error"),
        description: error.message || "Failed to delete formula",
        color: "danger",
      });
    }
  };

  if (authLoading) {
    return <Spinner size="lg" className="flex justify-center mt-10" />;
  }

  if (!user || !user.roles.includes("admin")) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-default-500">{t("description")}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-col items-start gap-2">
          <div className="flex items-center justify-between w-full">
            <h2 className="text-lg font-semibold">{t("subtitle")}</h2>
            <Button
              size="sm"
              variant="flat"
              startContent={<BookOpen size={14} />}
              onPress={onExamplesOpen}
            >
              {t("examples")}
            </Button>
          </div>
          <div className="flex items-start gap-2 p-3 bg-default-100 rounded-lg w-full">
            <Info size={16} className="text-default-500 mt-0.5 shrink-0" />
            <p className="text-sm text-default-500">
              {t("formulaHelp")}
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <Table aria-label="Pricing table">
            <TableHeader>
              <TableColumn>MODEL</TableColumn>
              <TableColumn>FORMULA</TableColumn>
              <TableColumn>STATUS</TableColumn>
              <TableColumn>UPDATED</TableColumn>
              <TableColumn>ACTIONS</TableColumn>
            </TableHeader>
            <TableBody
              emptyContent={loading ? <Spinner /> : "No models found"}
              items={models}
            >
              {(model) => {
                const existingFormula = getFormulaForModel(model.id);
                return (
                  <TableRow key={model.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{model.name}</p>
                        <p className="text-xs text-default-400 font-mono truncate max-w-[200px]">
                          {model.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {existingFormula ? (
                        <code className="text-xs bg-default-100 px-2 py-1 rounded block max-w-[300px] truncate">
                          {existingFormula.formula}
                        </code>
                      ) : (
                        <span className="text-default-400 text-sm">
                          {t("noFormula")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {existingFormula ? (
                        <Chip size="sm" color="success" variant="flat">
                          Configured
                        </Chip>
                      ) : (
                        <Chip size="sm" color="warning" variant="flat">
                          Default (100)
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      {existingFormula
                        ? new Date(existingFormula.updatedAt).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<Edit size={14} />}
                          onPress={() => handleEditModel(model)}
                        >
                          {tCommon("edit")}
                        </Button>
                        {existingFormula && (
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isIconOnly
                            onPress={() => handleDelete(model.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      {/* Edit Formula Modal */}
      <Modal
        isOpen={isEditOpen}
        onOpenChange={onEditOpenChange}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex-col items-start">
                <span>{selectedModel?.name}</span>
                <span className="text-xs text-default-400 font-mono font-normal">
                  {selectedModel?.id}
                </span>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  {/* Formula Input */}
                  <Textarea
                    label={t("formula")}
                    placeholder={t("formulaPlaceholder")}
                    value={formula}
                    onValueChange={(v) => {
                      setFormula(v);
                      setValidationResult(null);
                    }}
                    minRows={3}
                    classNames={{
                      input: "font-mono text-sm",
                    }}
                  />

                  {/* Available Parameters - Click to Copy */}
                  {selectedModel && selectedModel.params.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-default-500">
                        {t("clickToCopy")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedModel.params.map((param) => (
                          <button
                            key={param.name}
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(param.name);
                              addToast({
                                title: t("copied"),
                                description: param.name,
                                color: "success",
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-default-100 hover:bg-default-200 rounded-md text-xs font-mono transition-colors cursor-pointer group"
                          >
                            <span>{param.name}</span>
                            <Copy size={12} className="text-default-400 group-hover:text-default-600" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation Result */}
                  {validationResult && (
                    <div
                      className={`p-3 rounded-lg flex items-center gap-2 ${
                        validationResult.valid
                          ? "bg-success-50 text-success-700"
                          : "bg-danger-50 text-danger-700"
                      }`}
                    >
                      {validationResult.valid ? (
                        <>
                          <Check size={16} />
                          <span>{t("validFormula")}</span>
                          {validationResult.testResult !== undefined && (
                            <span className="ml-auto font-mono font-bold">
                              {t("testResult")}: {validationResult.testResult} credits
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <X size={16} />
                          <span>
                            {t("invalidFormula")}: {validationResult.error}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Test Parameters */}
                  <Accordion defaultExpandedKeys={["params"]}>
                    <AccordionItem
                      key="params"
                      aria-label="Test Parameters"
                      title={
                        <span className="text-sm font-medium">
                          {t("testParams")}
                        </span>
                      }
                    >
                      <div className="grid grid-cols-2 gap-3">
                        {selectedModel?.params.map((param) => (
                          <div key={param.name}>
                            {param.options && param.options.length > 0 ? (
                              <Select
                                size="sm"
                                label={param.name}
                                selectedKeys={testParams[param.name] ? [testParams[param.name]] : []}
                                onSelectionChange={(keys) => {
                                  const selected = Array.from(keys)[0] as string;
                                  setTestParams({ ...testParams, [param.name]: selected || "" });
                                }}
                                description="numbers extracted, letters ignored"
                              >
                                {param.options.map((option) => (
                                  <SelectItem key={String(option)}>
                                    {String(option)}
                                  </SelectItem>
                                ))}
                              </Select>
                            ) : param.type === "boolean" ? (
                              <div className="flex items-center justify-between py-2">
                                <div>
                                  <span className="text-sm">{param.name}</span>
                                  <p className="text-xs text-default-400">on = 1, off = 0</p>
                                </div>
                                <Switch
                                  size="sm"
                                  isSelected={testParams[param.name] === "true"}
                                  onValueChange={(v) =>
                                    setTestParams({ ...testParams, [param.name]: v ? "true" : "false" })
                                  }
                                />
                              </div>
                            ) : (
                              <Input
                                size="sm"
                                label={param.name}
                                placeholder={param.type}
                                value={testParams[param.name] || ""}
                                onValueChange={(v) =>
                                  setTestParams({ ...testParams, [param.name]: v })
                                }
                                description={param.type}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionItem>
                  </Accordion>

                  {/* Description */}
                  <Textarea
                    label="Description (optional)"
                    placeholder="Notes about this pricing formula..."
                    value={description}
                    onValueChange={setDescription}
                    minRows={2}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  {tCommon("cancel")}
                </Button>
                <Button
                  variant="flat"
                  startContent={<Calculator size={16} />}
                  onPress={handleValidate}
                  isLoading={validating}
                  isDisabled={!formula.trim()}
                >
                  {t("validate")}
                </Button>
                <Button
                  color="primary"
                  onPress={handleSave}
                  isLoading={saving}
                  isDisabled={!formula.trim() || (validationResult !== null && !validationResult.valid)}
                >
                  {tCommon("save")}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Examples Modal */}
      <Modal
        isOpen={isExamplesOpen}
        onOpenChange={onExamplesOpenChange}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>{t("examples")}</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  {/* Example 1 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleDuration")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono">
                      duration * 20
                    </code>
                    <p className="text-xs text-default-500">{t("exampleDurationDesc")}</p>
                  </div>

                  {/* Example 2 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleResolution")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono">
                      {"duration * (resolution == 4 ? 30 : resolution >= 1080 ? 20 : 10)"}
                    </code>
                    <p className="text-xs text-default-500">{t("exampleResolutionDesc")}</p>
                  </div>

                  {/* Example 3 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleBoolean")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono">
                      100 + generate_audio * 50
                    </code>
                    <p className="text-xs text-default-500">{t("exampleBooleanDesc")}</p>
                  </div>

                  {/* Example 4 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleComplex")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono whitespace-pre-wrap">
                      {"duration * (resolution == 4 ? 30 : resolution >= 1080 ? 20 : 10) + generate_audio * 50"}
                    </code>
                    <p className="text-xs text-default-500">{t("exampleComplexDesc")}</p>
                  </div>

                  {/* Example 5 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleAspectRatio")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono">
                      100 * (aspect_ratio == 21 ? 1.5 : 1)
                    </code>
                    <p className="text-xs text-default-500">{t("exampleAspectRatioDesc")}</p>
                  </div>

                  {/* Example 6 */}
                  <div className="p-3 bg-default-50 rounded-lg space-y-1">
                    <p className="text-sm font-medium">{t("exampleMinMax")}</p>
                    <code className="block text-xs bg-default-100 px-2 py-1.5 rounded font-mono">
                      max(50, duration * 15)
                    </code>
                    <p className="text-xs text-default-500">{t("exampleMinMaxDesc")}</p>
                  </div>
                </div>
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
