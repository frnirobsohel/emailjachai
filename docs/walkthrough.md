# cPanel Deployment Guide
We have successfully re-architected the project internally to allow seamless hosting on cPanel or HestiaPanel where Next.js runs as the main web root.

## 1. Domain Configuration
1. Use cPanel's **"Setup Node.js App"** to map your Next.js application to the main domain. Ensure the application root points to your `frontend` folder.
2. Ensure you have the PHP API files located in `public_html/api` (or wherever your `document_root` is mapped + `/api`).

## 2. Environment Setup
In your cPanel File Manager, edit `frontend/.env.local`:
```env
# Change this to your live domain
API_BASE_URL=https://yourdomain.com/api
FRONTEND_URL=https://yourdomain.com
```

## 3. The Root `.htaccess`
Node.js via Phusion Passenger will try to hijack **all** traffic to your domain. To ensure your PHP API continues working at `yourdomain.com/api`, create an `.htaccess` file in your `public_html` (domain root) with the following content:

```apache
# Disable Node.js Passenger for the /api directory
<IfModule mod_passenger.c>
  PassengerEnabled on
</IfModule>

<Directory "/home/YOUR_CPANEL_USER/public_html/api">
  <IfModule mod_passenger.c>
    PassengerEnabled off
  </IfModule>
</Directory>
```
*(Replace `YOUR_CPANEL_USER` with your actual cPanel username or adjust the absolute path for HestiaPanel).*

## Summary of Changes Made
- **Conflict Resolved:** Renamed Next.js internal API routes (`app/api`) to `app/next-api`. This officially frees up the `/api` directory for your PHP backend!
- **Component Updates:** Searched and updated 6+ frontend components that were calling `/api/auth` or `/api/proxy` to point to `/next-api`.
- **Environment Updates:** Added better fallbacks in Next.js backend proxy configurations prioritizing the `API_BASE_URL` from `.env.local` to safely contact the PHP backend natively over the web.

You will need to completely restart your `npm run dev` script locally to flush out the old Next.js folder cache so the new `/next-api` folder loads!
