import { api } from "./client";

export interface CompanyDocument {
  id: string;
  title: string | null;
  format: string;
  latestRevisionNumber: number;
  createdByAgentId: string | null;
  createdByAgentName: string | null;
  createdByUserId: string | null;
  issueId: string | null;
  issueTitle: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface CompanyDocumentDetail extends CompanyDocument {
  latestBody: string;
  latestRevisionId: string | null;
}

export const companyDocumentsApi = {
  list: (companyId: string) =>
    api.get<CompanyDocument[]>(`/companies/${companyId}/documents`),
  get: (id: string) =>
    api.get<CompanyDocumentDetail>(`/documents/${id}`),
  create: (companyId: string, data: { title: string; body: string }) =>
    api.post<CompanyDocumentDetail>(`/companies/${companyId}/documents`, data),
  update: (id: string, data: { title?: string; body?: string; changeSummary?: string; baseRevisionId?: string }) =>
    api.patch<CompanyDocumentDetail>(`/documents/${id}`, data),
  delete: (id: string) =>
    api.delete<{ ok: true }>(`/documents/${id}`),
};
