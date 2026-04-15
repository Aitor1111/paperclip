import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companyDocumentsApi } from "../api/company-documents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs, type Breadcrumb } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { useAutosaveIndicator } from "../hooks/useAutosaveIndicator";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";
import { InlineEditor } from "../components/InlineEditor";
import { MarkdownBody } from "../components/MarkdownBody";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Pencil, Eye, Trash2, FolderOpen, Check, X } from "lucide-react";

const AUTOSAVE_DEBOUNCE_MS = 900;

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    state: autosaveState,
    markDirty,
    reset: resetAutosave,
    runSave,
  } = useAutosaveIndicator();

  const {
    data: doc,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.companyDocuments.detail(id!),
    queryFn: () => companyDocumentsApi.get(id!),
    enabled: !!id,
  });

  // Initialize draft from loaded doc
  useEffect(() => {
    if (doc && !draftInitialized) {
      setDraft(doc.latestBody);
      setDraftInitialized(true);
    }
  }, [doc, draftInitialized]);

  // Sync draft when doc body changes externally and not editing
  useEffect(() => {
    if (doc && !editing) {
      setDraft(doc.latestBody);
    }
  }, [doc, editing]);

  useEffect(() => {
    const crumbs: Breadcrumb[] = [{ label: "Docs", href: "/documents" }];
    if (doc?.folder) {
      crumbs.push({ label: doc.folder });
    }
    crumbs.push({ label: doc?.title ?? "Document" });
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, doc]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const updateDocument = useMutation({
    mutationFn: (data: { title?: string; body?: string; changeSummary?: string; baseRevisionId?: string; folder?: string | null }) =>
      companyDocumentsApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyDocuments.detail(id!),
      });
      if (selectedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.companyDocuments.list(selectedCompanyId),
        });
      }
    },
  });

  const deleteDocument = useMutation({
    mutationFn: () => companyDocumentsApi.delete(id!),
    onSuccess: () => {
      if (selectedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.companyDocuments.list(selectedCompanyId),
        });
      }
      pushToast({ title: "Document deleted" });
      navigate("/documents");
    },
    onError: (err) => {
      pushToast({ title: "Failed to delete document", body: err.message, tone: "error" });
    },
  });

  const saveBody = useCallback(
    async (body: string) => {
      const data: { body: string; baseRevisionId?: string } = { body };
      if (doc?.latestRevisionId) {
        data.baseRevisionId = doc.latestRevisionId;
      }
      await updateDocument.mutateAsync(data);
    },
    [doc?.latestRevisionId, updateDocument],
  );

  // Autosave when editing
  useEffect(() => {
    if (!editing || !draftInitialized) return;
    if (draft === doc?.latestBody) {
      resetAutosave();
      return;
    }
    markDirty();
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      void runSave(() => saveBody(draft));
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [draft, editing, draftInitialized, doc?.latestBody, markDirty, resetAutosave, runSave, saveBody]);

  function handleDelete() {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    deleteDocument.mutate();
  }

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!doc) return null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Rev {doc.latestRevisionNumber}
          </span>
          <span className="text-xs text-muted-foreground">
            {relativeTime(doc.updatedAt)}
          </span>
          {doc.createdByAgentName && (
            <span className="text-xs text-muted-foreground">
              by {doc.createdByAgentName}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setEditing(!editing)}
              title={editing ? "View" : "Edit"}
            >
              {editing ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleDelete}
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5" />
          {editingFolder ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = folderDraft.trim();
                updateDocument.mutate({ folder: trimmed || null });
                setEditingFolder(false);
              }}
            >
              <Input
                autoFocus
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                placeholder="Folder name..."
                className="h-6 w-36 text-xs"
              />
              <Button type="submit" variant="ghost" size="icon-xs">
                <Check className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setEditingFolder(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="hover:text-foreground transition-colors"
              onClick={() => {
                setFolderDraft(doc.folder ?? "");
                setEditingFolder(true);
              }}
            >
              {doc.folder ?? "Unfiled"}
            </button>
          )}
        </div>

        <InlineEditor
          value={doc.title ?? ""}
          onSave={(title) => updateDocument.mutate({ title })}
          as="h2"
          className="text-xl font-bold"
          placeholder="Untitled document"
          nullable
        />
      </div>

      {editing ? (
        <div>
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            placeholder="Start writing..."
            bordered
          />
          <div className="flex min-h-4 items-center justify-end pr-1 mt-1">
            <span
              className={cn(
                "text-[11px] transition-opacity duration-150",
                autosaveState === "error" ? "text-destructive" : "text-muted-foreground",
                autosaveState === "idle" ? "opacity-0" : "opacity-100",
              )}
            >
              {autosaveState === "saving"
                ? "Autosaving..."
                : autosaveState === "saved"
                  ? "Saved"
                  : autosaveState === "error"
                    ? "Could not save"
                    : "Idle"}
            </span>
          </div>
        </div>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {doc.latestBody ? (
            <MarkdownBody>{doc.latestBody}</MarkdownBody>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No content yet.{" "}
              <button
                onClick={() => setEditing(true)}
                className="underline hover:text-foreground transition-colors"
              >
                Start writing
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
