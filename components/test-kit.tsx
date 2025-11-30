"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import { Switch } from "@heroui/switch";
import { Textarea } from "@heroui/input";
import { Wrench } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Local storage key - must match what is used in ChatInterface
export const SYSTEM_PROMPT_STORAGE_KEY = "agent-1_systemPromptOverride";

export function TestKit() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Check if user is admin
  const isAdmin = user?.roles?.includes("admin");

  useEffect(() => {
    if (!isAdmin) return;

    // Load from local storage or backend
    const savedPrompt = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
    const savedEnabled = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY + "_enabled");

    if (savedEnabled === "true") setIsEnabled(true);

    if (savedPrompt) {
      setPrompt(savedPrompt);
    } else {
      fetchDefaultPrompt();
    }
  }, [isAdmin]);

  const fetchDefaultPrompt = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/system-prompt?agentId=agent-1");
      if (res.ok) {
        const data = await res.json();
        setPrompt(data.prompt);
        // Also save to local storage so it's ready to use
        localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, data.prompt);
      }
    } catch (e) {
      console.error("Failed to fetch system prompt", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptChange = (val: string) => {
    setPrompt(val);
    localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, val);
  };

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY + "_enabled", String(enabled));
  };

  if (!isAdmin) return null;

  return (
    <div className="fixed top-4 right-20 z-50">
       <Popover isOpen={isOpen} onOpenChange={setIsOpen} placement="bottom-end">
        <PopoverTrigger>
          <Button isIconOnly color="warning" variant="flat" aria-label="TestKit">
            <Wrench size={20} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[600px] p-4">
          <div className="flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">TestKit - System Prompt Override</h3>
               <Switch isSelected={isEnabled} onValueChange={handleToggle}>
                Override Active
              </Switch>
            </div>
            
            <Textarea
              label="System Prompt"
              placeholder="Enter system prompt..."
              value={prompt}
              onValueChange={handlePromptChange}
              minRows={10}
              maxRows={20}
              variant="bordered"
            />
            
            <div className="flex justify-end gap-2">
                 <Button size="sm" variant="light" onPress={fetchDefaultPrompt} isLoading={isLoading}>
                    Reset to Default
                 </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

