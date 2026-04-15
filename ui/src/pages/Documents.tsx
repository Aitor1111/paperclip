import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { companyDocumentsApi } from "../api/company-documents";
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
import { FileText, Plus, Bot, X } from "lucide-react";
import { useNavigate } from "@/lib/router";

export function Documents() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Docs" }]);
  }, [setBreadcrumbs]);

  const { data: documents, isLoading, error } = useQuery({
    queryKey: queryKeys.companyDocuments.list(selectedCompanyId!),
    queryFn: () => companyDocumentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const createDocument = useMutation({
    mutationFn: (data: { title: string; body: string }) =>
      companyDocumentsApi.create(selectedCompanyId!, data),
    onSuccess: (doc) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.companyDocuments.list(selectedCompanyId!),
      });
      setShowNewForm(false);
      setNewTitle("");
      navigate(`/documents/${doc.id}`);
    },
    onError: (err) => {
      pushToast({ title: "Failed to create document", body: err.message, tone: "error" });
    },
  });

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    createDocument.mutate({ title, body: "" });
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
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </form>
            )}
          </div>

          {documents && documents.length > 0 && (
            <div className="border border-border">
              {documents.map((doc) => (
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
        </>
      )}
    </div>
  );
}
