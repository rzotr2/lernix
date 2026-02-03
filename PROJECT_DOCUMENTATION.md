# Next.js + Stripe + Supabase Template - Complete Documentation

## Project Overview

This is a production-ready Next.js template that integrates Stripe payments, Supabase authentication/database, and automated email workflows with Resend. It's designed as a comprehensive MVP launchpad with internationalization, modern UI components, and AI-powered content blocks.

## Technology Stack

- **Framework**: Next.js 15.5.9 (App Router)
- **Language**: TypeScript 5
- **UI**: React 19, Tailwind CSS 3.4.1
- **Authentication**: Supabase
- **Payments**: Stripe
- **Email**: Resend + React Email
- **Internationalization**: Next-intl
- **UI Libraries**: Framer Motion, Radix UI, DnD Kit, Recharts, Lucide React
- **Database**: Supabase PostgreSQL

## Project Structure

```
app/                    # Next.js app directory
├── [locale]/          # Internationalized routes (en, de, uk)
│   ├── dashboard/     # Main dashboard page
│   ├── pay/          # Payment page
│   ├── profile/      # User profile
│   └── ...
├── api/              # API routes
│   ├── stripe/       # Stripe webhook handlers
│   ├── email/        # Email sending endpoints
│   ├── generate/     # Content generation
│   └── ...
├── auth/             # Authentication pages
├── login/            # Login page
└── layout.tsx        # Root layout

components/           # React components
├── Account/          # Account management
├── Dashboard/        # Dashboard components
├── Auth/            # Authentication forms
├── Blocks/          # Content blocks (AI-powered)
├── Pricing/         # Pricing plans
├── Stripe/          # Stripe integration
└── UI/              # Reusable UI components

contexts/            # React contexts
├── AuthContext.tsx  # Authentication state
└── LayoutContext.tsx # Layout/theme state

services/            # Business logic
├── dashboardService.ts
└── emailService.ts

supabase/            # Database setup
├── functions/       # Edge functions for emails
└── scripts/         # Database schema

utils/               # Utilities
└── supabase.ts      # Supabase client configuration
```

## Pages & Routes

### Public Pages
- **`/`** (Root) - Redirects to localized dashboard based on stored locale
- **`/login`** - Authentication page with email/password and Google sign-in
- **`/[locale]/dashboard`** - Main dashboard (protected)
- **`/[locale]/pay`** - Payment processing with Stripe
- **`/[locale]/profile`** - User profile management
- **`/[locale]/password`** - Password reset/update

### API Routes
- **`/api/stripe/webhook`** - Handles Stripe subscription events
- **`/api/email/*`** - Email sending endpoints
- **`/api/generate/*`** - Content generation endpoints
- **`/api/attachments/*`** - File attachment handling
- **`/api/blocks/*`** - Content block management
- **`/api/export/*`** - Data export functionality

### Authentication Routes
- **`/auth/callback`** - OAuth callback handler
- **`/auth/confirm`** - Email confirmation
- **`/auth/reset-password`** - Password reset

## Key Features

### 1. Authentication System
- Email/password authentication with Supabase
- Google OAuth integration
- Session management with auto-refresh
- Protected routes middleware
- Password reset flow

### 2. Stripe Integration
- Subscription management
- Webhook handling for:
  - `checkout.session.completed`
  - `customer.subscription.created/updated/deleted`
- Payment processing
- Subscription status tracking in Supabase

### 3. Email Automation
- Welcome emails for new users
- Billing notifications
- Cancellation confirmations
- Automated workflows via Supabase Database Triggers
- Edge Functions for email delivery

### 4. Internationalization
- Three supported locales: English (en), German (de), Ukrainian (uk)
- Next-intl middleware for route localization
- Language switcher in TopBar
- Locale persistence in localStorage

### 5. UI/UX Features
- Dark/light theme toggle
- Responsive design
- Smooth animations with Framer Motion
- Drag-and-drop functionality with DnD Kit
- Modern component library with Radix UI
- Data visualization with Recharts

### 6. AI-Powered Content Blocks
- **FlashcardBlock** - Interactive flashcards
- **GraphBlock** - Data visualization
- **MermaidBlock** - Diagram generation
- **QuizBlock** - Interactive quizzes
- **TableBlock** - Data tables
- **TimelineBlock** - Chronological timelines

## User Experience Flow

### First-Time Visitor
1. User visits the root URL (`/`)
2. System checks `localStorage` for stored locale preference
3. Redirects to `/[locale]/dashboard` (e.g., `/en/dashboard`)
4. If not authenticated, redirects to `/login`
5. Login page offers:
   - Email/password sign-in
   - Google OAuth
   - Password reset option

### Authentication Process
1. User signs in via email or Google
2. Supabase creates/manages session
3. `AuthContext` updates global authentication state
4. User redirected to dashboard
5. Session tokens stored securely

### Dashboard Experience
1. **Protected route** - requires authentication
2. Fetches user data and subscription status
3. Displays personalized dashboard with:
   - User information
   - Subscription details
   - Content blocks
   - Navigation menu

### Payment Flow
1. User navigates to `/[locale]/pay`
2. Selects subscription plan
3. Stripe Checkout handles payment
4. Webhook updates user subscription in Supabase
5. User receives confirmation email

## Component Interactions

### Context Providers
- **`AuthContext`** - Manages authentication state across all components
- **`LayoutContext`** - Handles theme (light/dark) and layout preferences

### TopBar Component
- Displays user authentication status
- Theme toggle button
- Language selector
- Navigation menu
- Sign-out functionality

### ProtectedRoute Component
- Wraps protected pages
- Checks authentication status
- Redirects to login if not authenticated

### Content Blocks
- Each block is a standalone React component
- Can be dynamically added/removed
- Support drag-and-drop reordering
- Integrate with AI generation APIs

## Styling & Design System

### Tailwind Configuration
- Custom color palette:
  - Primary: Blue gradient
  - Danger: Red for errors
  - Neutral: Gray scale
  - Text: High contrast
  - Surface: Background colors
  - Accent: Highlight colors
- Custom box shadows
- Responsive breakpoints

### Design Principles
- Minimalist, clean interface
- Consistent spacing and typography
- Accessibility-focused
- Mobile-first responsive design
- Smooth transitions and animations

## Database Schema

### Key Tables
1. **users** - Extended Supabase auth users
2. **subscriptions** - Stripe subscription data
3. **pages** - User-created pages
4. **blocks** - Content blocks within pages
5. **attachments** - File attachments
6. **user_email_logs** - Email delivery tracking

### Security Policies
- Row Level Security (RLS) enabled
- User-specific data isolation
- Secure file storage with Supabase Storage

## Email Automation System

### Trigger-Based Workflows
1. **User Registration** → Welcome email
2. **Subscription Creation** → Billing confirmation
3. **Subscription Cancellation** → Cancellation email

### Edge Functions
- Located in `supabase/functions/`
- Handle email template rendering
- Integrate with Resend API
- Support multiple email types

## Development Setup

### Environment Variables
Required variables (see `.env.example`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `POSTHOG_KEY`
- `RESEND_API_KEY`

### Prerequisites
1. Node.js 18+ 
2. Supabase account and project
3. Stripe account
4. Resend account
5. Google Cloud Platform (for OAuth)

## Navigation Flow

### Main Navigation Paths
```
/ → /[locale]/dashboard → /[locale]/profile
                     ↘ /[locale]/pay
                     ↘ /[locale]/password
                     ↘ /api/* (various endpoints)
```

### Authentication States
- **Unauthenticated**: Redirected to `/login`
- **Authenticated**: Access to protected routes
- **Session expired**: Auto-refresh or redirect to login

## Project Goals & User Value

### Primary Objectives
1. Provide a production-ready MVP template
2. Simplify integration of essential SaaS services
3. Offer internationalization out-of-the-box
4. Enable rapid prototyping with AI components
5. Ensure security and scalability

### User Benefits
- **Developers**: Quick startup with pre-configured services
- **Startups**: Ready-to-use payment and authentication
- **Teams**: Collaborative content creation with AI blocks
- **End Users**: Seamless multilingual experience with secure payments

## Deployment

### Supported Platforms
- Vercel (recommended)
- Netlify
- Any Node.js hosting with environment variables

### Build Process
```bash
npm install
npm run build
npm start
```

## Testing

### Included Tools
- Playwright for end-to-end testing
- ESLint for code quality
- TypeScript for type safety

## Future Enhancements

### Planned Features
1. Additional payment providers
2. More AI content block types
3. Advanced analytics dashboard
4. Team collaboration features
5. Mobile app via React Native

## Support & Resources

- GitHub repository with issues tracking
- Detailed README with setup instructions
- Example configurations in `.cursor/mcp.json.example`
- Database migration scripts

---

*This documentation provides a comprehensive overview of the Next.js + Stripe + Supabase template. For specific implementation details, refer to the individual component files and API routes.*