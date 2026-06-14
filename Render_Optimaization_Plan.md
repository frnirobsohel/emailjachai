# Laravel-like SSR Migration Plan

## Goal
To implement Server-Side Rendering (SSR) across all pages in the Next.js application. This ensures that when a user visits any page (Dashboard, API Keys, Bulk Upload, Admin pages), the server fetches the necessary data directly from the Go API and returns fully populated HTML. This eliminates client-side "loading spinners" and stops the browser from making proxy API calls on initial load, matching the "Laravel Blade" experience perfectly.

## Pages to Migrate

We have identified **27 pages** in the project. The migration will be done in phases.

### Phase 1: Dashboard Feature Pages
These pages are frequently accessed by users and should have zero loading time.
- `app/(dashboard)/dashboard/api-keys/page.tsx`
- `app/(dashboard)/dashboard/jobs/page.tsx`
- `app/(dashboard)/dashboard/jobs/[id]/page.tsx`
- `app/(dashboard)/dashboard/profile/page.tsx`
- `app/(dashboard)/dashboard/single-verify/page.tsx`
- `app/(dashboard)/dashboard/bulk-upload/page.tsx`
- `app/(dashboard)/dashboard/credits/page.tsx`
- `app/(dashboard)/dashboard/credits/history/page.tsx`
- `app/(dashboard)/dashboard/reseller/transfer/page.tsx`

### Phase 2: Admin Panel Pages
The Admin panel also heavily relies on data fetching and should be instant.
- `app/admin/page.tsx` (Admin Dashboard)
- `app/admin/users/page.tsx`
- `app/admin/job-control/page.tsx`
- `app/admin/logs/page.tsx`
- `app/admin/monitoring/page.tsx`
- `app/admin/packages/page.tsx`
- `app/admin/server/page.tsx`
- `app/admin/smtp/page.tsx`
- `app/admin/domains/page.tsx`
- `app/admin/brand-build/page.tsx`
- `app/admin/license/page.tsx`
- `app/admin/settings/payment/page.tsx`

## Refactoring Strategy

For each page, we will follow this exact pattern:
1. **Server-Side Fetching:** Remove `"use client"` from the `page.tsx`. Use our newly created `fetchServer()` utility to fetch the initial data directly from the Go API using the user's secure cookie token.
2. **Component Splitting (Client-side Interactivity):** If the page has forms, modals, or interactive tables (like API key rotation or bulk file uploading), we will move the interactive parts into a separate `_components/ClientXYZ.tsx` file (which will have `"use client"`).
3. **Prop Drilling:** The Server Component will pass the fetched data as `initialData` props down to the interactive client components.
4. **Hydration:** The page renders instantly with real data. Client components mount and take over interactions (like deleting an item or uploading a file) without needing to fetch the initial list again.

## User Review Required

> [!CAUTION]
> This is a massive architectural upgrade! It involves modifying almost every page in the project to move data fetching from the client (browser) to the server. 
> Since there are so many pages, I recommend doing this in batches. I will start with **Phase 1 (Dashboard Pages)** first. Once those are stable, we can move to the Admin pages.

## Open Questions
- Do you agree with splitting the heavy interactive pages (like `ApiKeysPage`) into two files: a Server `page.tsx` (to fetch data) and a Client `ApiKeysView.tsx` (to handle modals/buttons)? This is the standard Next.js RSC approach to achieve your requested Laravel behavior.
