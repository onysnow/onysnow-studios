# Pending database work

Three things need a database this repository cannot reach. Each one below is
the exact statement to run and the exact query to confirm it worked. Run them
against production in the Supabase SQL editor.

They are listed in the order they should be done. The first is a security fix
and is the only urgent one.

---

## 1. Close the automatic first-admin grant

**Migration:** `supabase/migrations/20260923120000_close_first_admin_grant.sql`
**Urgency:** do this first.

`grant_first_admin()` fires on every insert into `profiles` and grants admin to
whoever caused it, whenever `admin_users` happens to be empty. With open
self-service signup on `/auth`, that makes "the next stranger to sign up" a
path to full studio access — every inquiry, the subscriber list, every public
page, and storage write and delete.

It is not only a theoretical window. `admin_users.user_id` is
`REFERENCES auth.users ON DELETE CASCADE`, so the table empties if the owner's
auth row is ever deleted, and it is empty in a fresh database, a restored
backup, or a staging clone pointed at the same front end.

### Check first — this one can lock you out

The migration refuses to apply if `admin_users` is empty, which is the right
behaviour: closing the only remaining path to admin on a database that has no
admin locks everyone out permanently. Confirm your row exists before running
it:

```sql
select u.email, a.user_id
from public.admin_users a
join auth.users u on u.id = a.user_id;
```

You must see your own account. **If this returns no rows, stop** and add
yourself from the Supabase dashboard first.

### Confirm it worked

```sql
select tgname
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and not tgisinternal;
```

The first-admin trigger should be absent. After this, granting a new admin is a
deliberate insert from the Supabase dashboard — there is no path to admin
through the application at all, by design, which is appropriate for a studio
with one operator.

---

## 2. Fix the display-font setting

**Migration:** `supabase/migrations/20260923130000_display_font_slugs.sql`

The portal wrote human-readable names (`Barlow Condensed`) and so did the seed,
but `CustomCss` lowercases the value and tests it against a hyphenated set, and
`styles.css` only defines `[data-display-font="..."]` rules for the hyphenated
form. The stored value could never match anything, so the setting has never
worked — including at its default.

### Confirm it worked

```sql
select value from public.site_settings where key = 'display_font';
```

Must be one of `jost`, `inter-tight`, `barlow-condensed`. Anything else is
rewritten to `jost` by the migration, because those three are the only faces
actually requested from Google Fonts in `__root.tsx` and the rest would resolve
to nothing.

---

## 3. Backfill `photos.sources`

**No migration exists for this.** `20260921230000_responsive_photo_variants.sql`
added the column but did not populate it.

Every photo row created before that migration still has `sources` null, and
`photoSrcSet` falls back to serving the 2560px original at every size. On a
phone that is the full-resolution file for a 400px-wide slot — the single
largest thing the site does wrong for a visitor on mobile data.

### See how many are affected

```sql
select
  count(*) filter (where sources is null) as missing,
  count(*)                                as total
from public.photos;
```

### Why there is no SQL for the fix

The variants are not derivable in the database. `sources` records which resized
files actually exist in storage, and they are produced by the upload path on
the client. A row can only be backfilled by re-deriving the variants for its
`storage_path` and writing the result back.

Two options, and the choice is yours:

- **Re-upload the affected photographs through the admin.** Correct, needs no
  new code, and is reasonable if `missing` is small.
- **A one-off script** that lists the bucket, works out which variants each
  `storage_path` already has, generates the missing ones, and updates `sources`.
  Worth writing if `missing` is large. Say so and I will.

Run the count first — the answer decides which.

---

## Already fixed in code, no action needed

`use-admin.ts` was reading `claimed_first_admin` off `bootstrap_current_user`.
That field was dropped when migration `20260921214942` redefined the function
to return only `is_admin`, so the read produced `undefined`, coerced to
`false`, and the flag was permanently false. Nothing consumed it. Removed —
there is no first-admin claim left to report once item 1 is applied.
