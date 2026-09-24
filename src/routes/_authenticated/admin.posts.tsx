import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { AdminHeading } from "@/components/admin/AdminHeading";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { adminPhotosQuery, adminPostsQuery, deleteRow, insertRow, updateRow } from "@/lib/admin";
import { useContentRefresh } from "@/hooks/use-admin";
import { safeHtml } from "@/lib/safe-html";
import type { Post, PostBlock } from "@/lib/content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/posts")({ component: PostsPage });

const BLOCK_LABELS: Record<PostBlock["type"], string> = {
  heading: "Heading",
  prose: "Text",
  pull_quote: "Pull quote",
  full_bleed: "Full-bleed photo",
  image_pair: "Image pair",
  gallery: "Gallery",
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "untitled"
  );
}

function PostsPage() {
  const posts = useQuery(adminPostsQuery);
  const photos = useQuery(adminPhotosQuery);
  const refresh = useContentRefresh();
  const [openId, setOpenId] = useState<string | null>(null);
  /*
   * Block edits are buffered here and written on Save, the way the page-copy
   * editor already works.
   *
   * They used to go straight to the database: `onChange` reached `updateRow`,
   * and `RichTextEditor` fires `onChange` on every ProseMirror transaction, so
   * a 200-character paragraph was ~200 PATCH round trips and ~1,600 query
   * invalidations. It was also a write race -- each edit was computed from the
   * `blocks` array of the currently rendered query data, which those refetches
   * were replacing underneath it, so text visibly reverted while being typed.
   */
  const [drafts, setDrafts] = useState<Record<string, PostBlock[]>>({});
  const [savingBlocks, setSavingBlocks] = useState<string | null>(null);

  async function saveBlocks(id: string, blocks: PostBlock[]) {
    setSavingBlocks(id);
    try {
      // Cleaned on the way in rather than on the way out: the public pages
      // render this raw, and a parser on every visit is a steep price for
      // something only the studio can write. See lib/safe-html.ts.
      const clean = blocks.map((b) => (b.type === "prose" ? { ...b, html: safeHtml(b.html) } : b));
      await updateRow("posts", id, { blocks: clean });
      setDrafts(({ [id]: _dropped, ...rest }) => rest);
      refresh();
      toast.success("Saved");
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
    setSavingBlocks(null);
  }

  async function patch(id: string, values: Partial<Post> | Record<string, unknown>) {
    try {
      await updateRow("posts", id, values as Record<string, unknown>);
      refresh();
    } catch (error) {
      toast.error("Could not save", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function add() {
    const n = (posts.data ?? []).length + 1;
    try {
      await insertRow("posts", {
        slug: `new-post-${Date.now().toString(36)}`,
        title: "Untitled",
        excerpt: "",
        blocks: [],
        sort_order: n,
        published: false,
      });
      refresh();
    } catch (error) {
      toast.error("Could not add", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const list = posts.data ?? [];
  const photoList = photos.data ?? [];

  return (
    <>
      <AdminHeading
        title="Journal"
        description="Posts are built from blocks, so each one can be laid out like a magazine spread."
        action={
          <Button variant="cinematic" onClick={add}>
            <Plus /> New post
          </Button>
        }
      />

      {posts.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet. Add one to get started.</p>
      ) : (
        <div className="space-y-4">
          {list.map((post) => {
            const saved: PostBlock[] = Array.isArray(post.blocks) ? post.blocks : [];
            const blocks = drafts[post.id] ?? saved;
            const blocksDirty = drafts[post.id] !== undefined;
            const isOpen = openId === post.id;

            const setBlocks = (next: PostBlock[]) => setDrafts((d) => ({ ...d, [post.id]: next }));

            return (
              <div key={post.id} className="rounded-lg border border-border bg-card p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title">
                    {(id) => (
                      <Input
                        id={id}
                        defaultValue={post.title}
                        onBlur={(e) =>
                          e.target.value !== post.title && patch(post.id, { title: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field label="URL slug">
                    {(id) => (
                      <Input
                        id={id}
                        defaultValue={post.slug}
                        onBlur={(e) => {
                          const v = slugify(e.target.value);
                          if (v !== post.slug) patch(post.id, { slug: v });
                        }}
                      />
                    )}
                  </Field>
                  <Field label="Excerpt" className="sm:col-span-2">
                    {(id) => (
                      <Textarea
                        id={id}
                        rows={2}
                        defaultValue={post.excerpt}
                        onBlur={(e) =>
                          e.target.value !== post.excerpt &&
                          patch(post.id, { excerpt: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <Field label="Cover photograph">
                    {(id) => (
                      <Select
                        defaultValue={post.cover_photo_id ?? "none"}
                        onValueChange={(v) =>
                          patch(post.id, { cover_photo_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger id={id}>
                          <SelectValue placeholder="Choose a photograph" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {photoList.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.title || p.storage_path}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                  <Field label="Reading time (minutes)">
                    {(id) => (
                      <Input
                        id={id}
                        type="number"
                        min={1}
                        defaultValue={post.reading_minutes}
                        onBlur={(e) =>
                          patch(post.id, { reading_minutes: Number(e.target.value) || 1 })
                        }
                      />
                    )}
                  </Field>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={post.published}
                      onCheckedChange={(v) =>
                        patch(post.id, {
                          published: v,
                          published_at:
                            v && !post.published_at ? new Date().toISOString() : post.published_at,
                        })
                      }
                    />
                    Published
                  </label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenId(isOpen ? null : post.id)}
                    >
                      {isOpen ? "Hide" : "Edit"} blocks ({blocks.length})
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={`/journal/${post.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-4" /> View
                      </a>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Delete post">
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{post.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              await deleteRow("posts", post.id);
                              refresh();
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {isOpen ? (
                  <>
                    <BlockEditor
                      blocks={blocks}
                      photos={photoList.map((p) => ({
                        id: p.id,
                        label: p.title || p.storage_path,
                      }))}
                      onChange={setBlocks}
                    />
                    <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
                      {blocksDirty ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={savingBlocks === post.id}
                          onClick={() => setDrafts(({ [post.id]: _dropped, ...rest }) => rest)}
                        >
                          Discard changes
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant={blocksDirty ? "cinematic" : "ghost"}
                        disabled={!blocksDirty || savingBlocks === post.id}
                        onClick={() => void saveBlocks(post.id, blocks)}
                      >
                        <Save /> {blocksDirty ? "Save blocks" : "Saved"}
                      </Button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function BlockEditor({
  blocks,
  photos,
  onChange,
}: {
  blocks: PostBlock[];
  photos: { id: string; label: string }[];
  onChange: (next: PostBlock[]) => void;
}) {
  function update(i: number, next: PostBlock) {
    onChange(blocks.map((b, idx) => (idx === i ? next : b)));
  }
  function remove(i: number) {
    onChange(blocks.filter((_, idx) => idx !== i));
  }
  function move(i: number, delta: number) {
    const target = i + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(i, 1);
    if (item) next.splice(target, 0, item);
    onChange(next);
  }
  function addBlock(type: PostBlock["type"]) {
    const blank: Record<PostBlock["type"], PostBlock> = {
      heading: { type: "heading", text: "" },
      prose: { type: "prose", html: "" },
      pull_quote: { type: "pull_quote", text: "" },
      full_bleed: { type: "full_bleed", photo_id: photos[0]?.id ?? "" },
      image_pair: { type: "image_pair", photo_ids: [photos[0]?.id ?? "", photos[1]?.id ?? ""] },
      gallery: { type: "gallery", photo_ids: [] },
    };
    onChange([...blocks, blank[type]]);
  }

  const PhotoPicker = ({ value, onPick }: { value: string; onPick: (id: string) => void }) => (
    <Select value={value || "none"} onValueChange={(v) => onPick(v === "none" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Choose a photograph" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None</SelectItem>
        {photos.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      {/*
       * Every field here is controlled on purpose.
       *
       * They were uncontrolled (`defaultValue` + `onBlur`) over index keys,
       * and `defaultValue` does nothing after mount. Moving a block up changed
       * which block sat at index `i` while React reused the same DOM node, so
       * the input kept displaying the PREVIOUS block's text -- and the next
       * blur wrote that stale text over whichever block now lived there.
       * Blocks A, B, C, move B up, touch the first field: B's heading silently
       * became A's. Controlled values make the index key harmless, because the
       * rendered value always follows the array.
       */}
      {blocks.map((block, i) => (
        <div key={i} className="rounded-md border border-border/70 bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {i + 1}. {BLOCK_LABELS[block.type]}
            </p>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(i, 1)}
                disabled={i === blocks.length - 1}
              >
                ↓
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove block"
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {block.type === "heading" ? (
              <Input
                value={block.text}
                placeholder="Section heading"
                onChange={(e) => update(i, { type: "heading", text: e.target.value })}
              />
            ) : null}

            {block.type === "prose" ? (
              <RichTextEditor
                value={block.html}
                onChange={(html) => update(i, { type: "prose", html })}
              />
            ) : null}

            {block.type === "pull_quote" ? (
              <>
                <Textarea
                  rows={2}
                  value={block.text}
                  placeholder="The line worth pulling out"
                  onChange={(e) =>
                    update(i, { ...block, type: "pull_quote", text: e.target.value })
                  }
                />
                <Input
                  value={block.attribution ?? ""}
                  placeholder="Attribution (optional)"
                  onChange={(e) =>
                    update(i, { ...block, type: "pull_quote", attribution: e.target.value })
                  }
                />
              </>
            ) : null}

            {block.type === "full_bleed" ? (
              <>
                <PhotoPicker
                  value={block.photo_id}
                  onPick={(id) => update(i, { ...block, photo_id: id })}
                />
                <Input
                  value={block.caption ?? ""}
                  placeholder="Caption (optional)"
                  onChange={(e) => update(i, { ...block, caption: e.target.value })}
                />
              </>
            ) : null}

            {block.type === "image_pair" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <PhotoPicker
                  value={block.photo_ids[0]}
                  onPick={(id) => update(i, { ...block, photo_ids: [id, block.photo_ids[1]] })}
                />
                <PhotoPicker
                  value={block.photo_ids[1]}
                  onPick={(id) => update(i, { ...block, photo_ids: [block.photo_ids[0], id] })}
                />
              </div>
            ) : null}

            {block.type === "gallery" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Tick the photographs for this set. They appear in the order listed here.
                </p>
                <div className="grid gap-1 sm:grid-cols-2">
                  {photos.map((p) => {
                    const on = block.photo_ids.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            update(i, {
                              ...block,
                              photo_ids: on
                                ? block.photo_ids.filter((id) => id !== p.id)
                                : [...block.photo_ids, p.id],
                            })
                          }
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {(Object.keys(BLOCK_LABELS) as PostBlock["type"][]).map((type) => (
          <Button key={type} variant="outline" size="sm" onClick={() => addBlock(type)}>
            <Plus className="size-3" /> {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  );
}
