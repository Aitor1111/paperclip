import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { documents, documentRevisions, issueDocuments, issues, agents } from "@paperclipai/db";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { conflict, notFound } from "../errors.js";
import { logActivity } from "../services/index.js";

export function companyDocumentRoutes(db: Db) {
  const router = Router();

  // GET /companies/:companyId/documents — list all documents for a company
  router.get("/companies/:companyId/documents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        folder: documents.folder,
        format: documents.format,
        latestRevisionNumber: documents.latestRevisionNumber,
        createdByAgentId: documents.createdByAgentId,
        createdByAgentName: agents.name,
        createdByUserId: documents.createdByUserId,
        issueId: issueDocuments.issueId,
        issueTitle: issues.title,
        updatedAt: documents.updatedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .leftJoin(issueDocuments, eq(issueDocuments.documentId, documents.id))
      .leftJoin(issues, eq(issues.id, issueDocuments.issueId))
      .leftJoin(agents, eq(agents.id, documents.createdByAgentId))
      .where(eq(documents.companyId, companyId))
      .orderBy(desc(documents.updatedAt));

    res.json(rows);
  });

  // GET /documents/:id — get a single document with body
  router.get("/documents/:id", async (req, res) => {
    const id = req.params.id as string;

    const [doc] = await db
      .select({
        id: documents.id,
        companyId: documents.companyId,
        title: documents.title,
        folder: documents.folder,
        format: documents.format,
        latestBody: documents.latestBody,
        latestRevisionId: documents.latestRevisionId,
        latestRevisionNumber: documents.latestRevisionNumber,
        createdByAgentId: documents.createdByAgentId,
        createdByUserId: documents.createdByUserId,
        updatedByAgentId: documents.updatedByAgentId,
        updatedByUserId: documents.updatedByUserId,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.id, id));

    if (!doc) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    assertCompanyAccess(req, doc.companyId);

    const [revCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentRevisions)
      .where(eq(documentRevisions.documentId, id));

    res.json({
      ...doc,
      revisionCount: Number(revCount.count),
    });
  });

  // POST /companies/:companyId/documents — create a company-level document
  router.post("/companies/:companyId/documents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const { title, body, format = "markdown", folder } = req.body as {
      title: string;
      body: string;
      format?: string;
      folder?: string;
    };

    const actor = getActorInfo(req);
    const createdByAgentId = actor.agentId ?? null;
    const createdByUserId = actor.actorType === "user" ? actor.actorId : null;

    const result = await db.transaction(async (tx) => {
      const now = new Date();

      const [document] = await tx
        .insert(documents)
        .values({
          companyId,
          title,
          folder: folder ?? null,
          format,
          latestBody: body,
          latestRevisionId: null,
          latestRevisionNumber: 1,
          createdByAgentId,
          createdByUserId,
          updatedByAgentId: createdByAgentId,
          updatedByUserId: createdByUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [revision] = await tx
        .insert(documentRevisions)
        .values({
          companyId,
          documentId: document.id,
          revisionNumber: 1,
          title,
          format,
          body,
          changeSummary: null,
          createdByAgentId,
          createdByUserId,
          createdAt: now,
        })
        .returning();

      await tx
        .update(documents)
        .set({ latestRevisionId: revision.id })
        .where(eq(documents.id, document.id));

      return {
        ...document,
        latestRevisionId: revision.id,
      };
    });

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "document.created",
      entityType: "document",
      entityId: result.id,
      details: { title },
    });

    res.status(201).json(result);
  });

  // PATCH /documents/:id — update a document's body
  router.patch("/documents/:id", async (req, res) => {
    const id = req.params.id as string;

    const [existing] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!existing) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    const { title, body, changeSummary, baseRevisionId, folder } = req.body as {
      title?: string;
      body?: string;
      changeSummary?: string;
      baseRevisionId?: string;
      folder?: string | null;
    };

    if (baseRevisionId && baseRevisionId !== existing.latestRevisionId) {
      throw conflict("Document was updated by someone else", {
        currentRevisionId: existing.latestRevisionId,
      });
    }

    const actor = getActorInfo(req);
    const updatedByAgentId = actor.agentId ?? null;
    const updatedByUserId = actor.actorType === "user" ? actor.actorId : null;

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const nextRevisionNumber = existing.latestRevisionNumber + 1;
      const newTitle = title ?? existing.title;
      const newBody = body ?? existing.latestBody;
      const newFormat = existing.format;

      const [revision] = await tx
        .insert(documentRevisions)
        .values({
          companyId: existing.companyId,
          documentId: existing.id,
          revisionNumber: nextRevisionNumber,
          title: newTitle,
          format: newFormat,
          body: newBody,
          changeSummary: changeSummary ?? null,
          createdByAgentId: updatedByAgentId,
          createdByUserId: updatedByUserId,
          createdAt: now,
        })
        .returning();

      const [updated] = await tx
        .update(documents)
        .set({
          title: newTitle,
          ...(folder !== undefined ? { folder } : {}),
          latestBody: newBody,
          latestRevisionId: revision.id,
          latestRevisionNumber: nextRevisionNumber,
          updatedByAgentId,
          updatedByUserId,
          updatedAt: now,
        })
        .where(eq(documents.id, existing.id))
        .returning();

      return updated;
    });

    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "document.updated",
      entityType: "document",
      entityId: existing.id,
      details: { title: title ?? undefined, changeSummary: changeSummary ?? undefined },
    });

    res.json(result);
  });

  // DELETE /documents/:id — delete a document and its revisions
  router.delete("/documents/:id", async (req, res) => {
    const id = req.params.id as string;

    const [existing] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id));

    if (!existing) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    await db.transaction(async (tx) => {
      // Remove junction rows first (if any)
      await tx.delete(issueDocuments).where(eq(issueDocuments.documentId, id));
      // Document revisions cascade via FK onDelete, but delete the document
      await tx.delete(documents).where(eq(documents.id, id));
    });

    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: existing.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "document.deleted",
      entityType: "document",
      entityId: existing.id,
    });

    res.json({ id: existing.id, deleted: true });
  });

  return router;
}
