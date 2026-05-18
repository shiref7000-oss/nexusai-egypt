# NexusAI - Egyptian E-Commerce AI OS

AI-Powered E-Commerce Operating System built specifically for the Egyptian COD market. 9 specialized AI agents working together to automate operations, optimize Meta ads, and manage Egyptian e-commerce businesses.

## Deployed Preview

**Live URL:** https://34nsbvpfbmu44.kimi.page/

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Icons:** Lucide React
- **Routing:** React Router DOM (HashRouter for static hosting)
- **Build Tool:** Vite

## Project Structure

```
src/
  pages/
    Landing.tsx      # Marketing landing page
    Dashboard.tsx    # Main KPI dashboard with charts
    Orders.tsx       # COD order management
    Agents.tsx       # AI agents control panel
    Analytics.tsx    # Media buying & shipping analytics
    SignIn.tsx       # Authentication page
  components/ui/     # shadcn/ui components
  types/
    index.ts         # TypeScript type definitions
  App.tsx            # Router configuration
  main.tsx           # Entry point
  index.css          # Global styles & theme
```

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing page with hero, agents, features, pricing |
| `/#/dashboard` | Dashboard | 8 KPI cards, revenue charts, order status, activity feed |
| `/#/orders` | Orders | Full COD order table with search, filters, status badges |
| `/#/agents` | AI Agents | 9 agents with status, capabilities, controls |
| `/#/analytics` | Analytics | Media buying, shipping, funnel, city performance |
| `/#/signin` | Sign In | Auth with email/password + Google |

## Egyptian Market KPIs

- Confirmation Rate: ~78-80%
- Delivery Rate: ~50-55% of confirmed
- COD Operations: Full reconciliation workflow
- Carriers: Bosta, Aramex, VHub
- Currency: EGP (Egyptian Pound)

## Environment Variables

Create a `.env` file in the root directory:

```env
# Meta API (for live campaign data)
VITE_META_APP_ID=your_meta_app_id
VITE_META_APP_SECRET=your_meta_app_secret
VITE_META_ACCESS_TOKEN=your_access_token

# AI APIs
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_GROQ_API_KEY=your_groq_api_key

# WhatsApp Business API
VITE_WHATSAPP_API_KEY=your_whatsapp_api_key
VITE_WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id

# Backend API (when ready)
VITE_API_BASE_URL=https://api.nexusai.eg

# Optional: PostHog analytics
VITE_POSTHOG_KEY=your_posthog_key
```

## Build Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Vercel Deployment

### Option 1: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

### Option 2: GitHub + Vercel Integration

1. Push this repository to GitHub
2. Connect repo to Vercel dashboard
3. Set framework preset to **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variables in Vercel dashboard

### Vercel Configuration

The `vercel.json` file is included for SPA routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

## Remaining Features to Implement

### Backend Integration
- [ ] tRPC + Drizzle ORM API layer
- [ ] MySQL database schema
- [ ] Meta Marketing API integration
- [ ] WhatsApp Business API webhook
- [ ] Gemini/Groq AI agent logic
- [ ] Authentication (JWT/OAuth)

### Dashboard Features
- [ ] Real-time data via WebSocket
- [ ] AI-generated recommendations
- [ ] Automated reporting
- [ ] Multi-tenant support

### Order Management
- [ ] Bulk order import/export
- [ ] Automated confirmation calls
- [ ] Shipping label generation
- [ ] COD reconciliation

### Analytics
- [ ] Live Meta Ads data
- [ ] Custom date range picker
- [ ] Export reports (PDF/CSV)
- [ ] Predictive analytics

### WhatsApp Integration
- [ ] Message templates
- [ ] Automated confirmation flow
- [ ] Customer chat interface
- [ ] Template approval workflow

## Recommended Stack Going Forward

### Frontend (Current)
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Recharts for visualizations
- TanStack Query for data fetching

### Backend (Next Phase)
- tRPC for type-safe APIs
- Drizzle ORM for database
- Hono for edge-compatible server
- MySQL for data storage
- Redis for caching

### AI Integration
- Gemini API (primary)
- Groq API (fallback)
- LangChain for agent orchestration
- Vector DB for knowledge base

### DevOps
- Vercel for frontend hosting
- Railway/Render for backend
- GitHub Actions for CI/CD
- PostHog for analytics

## License

Proprietary - NexusAI Egypt
