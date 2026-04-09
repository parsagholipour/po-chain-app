"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { uploadFileToStorage } from "@/lib/upload-client";

/**
 * Document picker on wizard step 0: selecting a file uploads immediately; clearing selection clears storage state.
 */
export function useWizardDocumentUpload(storagePrefix: string) {
  const [documentKey, setDocumentKey] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [isDocUploading, setIsDocUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      setIsDocUploading(true);
      setDocumentKey(null);
      try {
        const key = await uploadFileToStorage(file, storagePrefix);
        setDocumentKey(key);
        toast.success("Document uploaded");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setIsDocUploading(false);
      }
    },
    [storagePrefix],
  );

  const onDocFileChange = useCallback(
    async (file: File | null) => {
      if (!file) {
        setDocFile(null);
        setDocumentKey(null);
        return;
      }
      setDocFile(file);
      await uploadFile(file);
    },
    [uploadFile],
  );

  const onRetryDocUpload = useCallback(async () => {
    if (!docFile) return;
    await uploadFile(docFile);
  }, [docFile, uploadFile]);

  return {
    documentKey,
    setDocumentKey,
    docFile,
    isDocUploading,
    onDocFileChange,
    onRetryDocUpload,
  };
}
