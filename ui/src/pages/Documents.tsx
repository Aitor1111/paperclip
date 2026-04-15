import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companyDocumentsApi, type CompanyDocument } from "../api/company-documents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { relativeTime } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { EntityRow } from "../components/EntityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Plus, Bot, X, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "@/lib/router";

interface FolderGroup {
  folder: string;
  label: string;
  docs: CompanyDocument[];
}

function groupByFolder(documents: CompanyDocument[]): FolderGroup[] {
  const map = new Map<string, CompanyDocument[]>();
  for (const doc of documents) {
    const key = doc.folder ?? "";
    const existing = map.get(key);
    if (existing) {
      existing.push(doc);
    } else {
      map.set(key, [doc]);
    }
  }

  const groups: FolderGroup[] = [];
  const sortedKeys = [...map.keys()].sort((a, b) => {
    // Unfiled ("") goes last
    if (a === "") return 1;
    if (b === "") return -1;
    return a.localeCompare(b);
  });

  for (const key of sortedKeys) {
    const docs = map.get(key)!;
    // Sort documents within each folder by updatedAt DESC
    docs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    groups.push({
      folder: key,
      label: key || "Unfiled",
      docs,
    });
  }

  return groups;
}

export function Documents() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([{ label: "Docs" }]);
  }, [setBreadcrumbs]);

  const { data: documents, isLoading, error } = useQuery({
    queryKey: queryKeys.companyDocuments.list(selectedCompanyId!),
    queryFn: () => companyDocumentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const folderGroups = useMemo(() => {
    if (!documents) return [];
    return groupByFolder(documents);
  }, [documents]);

  const existingFolders = useMemo(() => {
    if (!documents) return [];
    const folders = new Set<string>();
    for (const doc of documents) {
      if (doc.folder) folders.add(doc.folder);
    }
    return [...folders].sort();
  }, [documents]);

  const createDocument = useMutation({
    mutationFn: (data: { title: string; body: string; folder?: string }) =>
      companyDocumentsApi.create(selectedCompanyId!, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyDocuments.list(selectedCompanyId!),
      });
      setShowNewForm(false);
      setNewTitle("");
      setNewFolder("");
      navigate(`/documents/${doc.id}`);
    },
    onError: (err) => {
      pushToast({ title: "Failed to create document", body: err.message, tone: "error" });
    },
  });

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    const folder = newFolder.trim() || undefined;
    createDocument.mutate({ title, body: "", folder });
  }

  function toggleFolder(folderKey: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderKey)) {
        next.delete(folderKey);
      } else {
        next.add(folderKey);
      }
      return next;
    });
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={FileText} message="Select a company to view documents." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {documents && documents.length === 0 && !showNewForm && (
        <EmptyState
          icon={FileText}
          message="No documents yet."
          action="New Document"
          onAction={() => setShowNewForm(true)}
        />
      )}

      {(showNewForm || (documents && documents.length > 0)) && (
        <>
          <div className="flex items-center gap-2">
            {!showNewForm && (
              <Button size="sm" variant="outline" onClick={() => setShowNewForm(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Document
              </Button>
            )}
            {showNewForm && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
              >
                <Input
                  autoFocus
                  placeholder="Document title..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-8 w-64 text-sm"
                />
                <Input
                  placeholder="Folder (optional)"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  list="existing-folders"
                  className="h-8 w-40 text-sm"
                />
                {existingFolders.length > 0 && (
                  <datalist id="existing-folders">
                    {existingFolders.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                )}
                <Button size="sm" type="submit" disabled={!newTitle.trim() || createDocument.isPending}>
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setShowNewForm(false);
                    setNewTitle("");
                    setNewFolder("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </form>
            )}
          </div>

          {folderGroups.length > 0 && (
            <div className="space-y-2">
              {folderGroups.map((group) => {
                const isCollapsed = collapsedFolders.has(group.folder);
                const isUnfiled = group.folder === "";
                return (
                  <div key={group.folder} className="border border-border">
                    <button
                      type="button"
                      onClick={() => toggleFolder(group.folder)}
                      className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {isUnfiled ? (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{group.label}</span>
                      <span className="text-xs text-muted-foreground">({group.docs.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div>
                        {group.docs.map((doc) => (
                          <EntityRow
                            key={doc.id}
                            leading={
                              <div className="relative">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                {doc.createdByAgentId && (
                                  <Bot className="h-2.5 w-2.5 text-muted-foreground absolute -bottom-0.5 -right-0.5" />
                                )}
                              </div>
                            }
                            title={doc.title ?? "Untitled"}
                            subtitle={[
                              doc.createdByAgentName ? `by ${doc.createdByAgentName}` : doc.createdByUserId ? "by you" : undefined,
                              doc.issueTitle ? `Issue: ${doc.issueTitle}` : undefined,
                              relativeTime(doc.updatedAt),
                            ]
                              .filter(Boolean)
                              .join(" \u00B7 ")}
                            to={`/documents/${doc.id}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
