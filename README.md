# Moodio Agent

A modern AI-powered creative platform for image and video generation with an intelligent conversational interface. Built with Next.js 16, React 19, and powered by multiple AI providers including Google Gemini, OpenAI, and Fal.ai.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [API Reference](#api-reference)
- [AI Agent System](#ai-agent-system)
- [Video Generation](#video-generation)
- [Image Generation](#image-generation)
- [Credits System](#credits-system)
- [Authentication](#authentication)
- [Admin Panel](#admin-panel)
- [Project Structure](#project-structure)
- [Development](#development)
- [Deployment](#deployment)

## Overview

Moodio Agent is a comprehensive creative AI platform that combines conversational AI with state-of-the-art image and video generation capabilities. Users interact with an intelligent agent that understands their creative intent, generates multiple image suggestions, and enables video creation from those images.

### Key Capabilities

- **Conversational Image Generation**: Chat with an AI agent that understands your creative vision and generates multiple image variations
- **Multi-Model Video Generation**: Transform images into videos using 10+ video generation models from leading providers
- **Project & Collection Management**: Organize generated assets into projects and shareable collections
- **Credit-Based Billing**: Flexible pricing system with admin-configurable formulas per model
- **Real-time Streaming**: Live streaming of AI responses and generation progress

## Features

### Creative Chat Interface
- Intelligent AI agent with structured thinking process
- Parallel variant generation for diverse creative options
- Support for image uploads and editing
- Conversation forking to explore different creative directions
- Configurable aspect ratios and image sizes (2K/4K)

### Video Generation (Storyboard)
- 10+ video models including:
  - **Seedance v1.5 Pro** (ByteDance) - Up to 12s with audio
  - **Hailuo 2.3 Pro/Fast** (MiniMax) - 1080p output
  - **Kling Video v2.6 Pro** - Cinematic visuals with native audio
  - **Veo 3.1** (Google DeepMind) - Up to 4K resolution
  - **Sora 2 Pro** (OpenAI) - State-of-the-art quality
  - **Wan v2.6** - Multi-shot segmentation support
- First-frame and first-last-frame generation modes
- Real-time progress tracking via webhooks
- Automatic credit refunds on failure

### Asset Management
- **Projects**: Top-level containers for organizing work
- **Collections**: Shareable folders within projects
- **Sharing**: Owner, collaborator, and viewer permissions
- **CloudFront CDN**: Secure, signed URLs for asset delivery

### Authentication
- Email OTP (one-time password) authentication
- WebAuthn/Passkey support for passwordless login
- JWT-based session management with refresh tokens
- Role-based access control (user, admin, new_user)

### Admin Dashboard
- User management with credit grants
- Chat and video generation monitoring
- Dynamic pricing formula editor
- Fal.ai usage tracking
- System maintenance tools

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │    Chat     │  │  Storyboard │  │  Collections │              │
│  │  Interface  │  │   (Video)   │  │   Manager   │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes (Next.js)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │  /chat  │  │ /video  │  │ /image  │  │  /auth  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
└───────┼────────────┼────────────┼────────────┼──────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌───────────────────────────────────────────────────────────────┐
│                        Core Libraries                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Agents  │  │  Video   │  │  Image   │  │   Auth   │       │
│  │ (LLM AI) │  │ (Fal.ai) │  │(Gemini/  │  │(JWT/OTP/ │       │
│  │          │  │          │  │  Fal)    │  │ Passkey) │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└───────────────────────────────────────────────────────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌───────────────────────────────────────────────────────────────┐
│                     External Services                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  OpenAI  │  │  Fal.ai  │  │  Google  │  │   AWS    │       │
│  │  GPT-4.1 │  │  Video   │  │  Gemini  │  │ S3/CF    │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                      PostgreSQL Database                       │
│  (Drizzle ORM - Users, Chats, Projects, Collections, etc.)    │
└───────────────────────────────────────────────────────────────┘
```

## Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | React framework with App Router |
| React | 19.2.3 | UI library |
| Redux Toolkit | 2.11.2 | State management |
| HeroUI | Various | UI component library (50+ components) |
| Framer Motion | 12.23.24 | Animations |
| Tailwind CSS | 4.1.17 | Styling |
| next-intl | 4.7.0 | Internationalization (en, zh-CN) |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Drizzle ORM | 0.44.7 | Type-safe database ORM |
| PostgreSQL | - | Primary database |
| jose | 6.1.2 | JWT handling |
| SimpleWebAuthn | 13.2.2 | Passkey authentication |
| nodemailer | 7.0.10 | Email delivery |

### AI/ML Services
| Provider | Models | Purpose |
|----------|--------|---------|
| OpenAI | GPT-4.1 | Chat agent LLM |
| Google | Gemini 3 Pro | Image generation/editing |
| Fal.ai | Multiple | Video generation, image generation |

### Cloud Infrastructure
| Service | Purpose |
|---------|---------|
| AWS S3 | Asset storage |
| AWS CloudFront | CDN with signed URLs/cookies |
| AWS Secrets Manager | Secure credential storage |

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd moodio-agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Create and migrate database**
   ```bash
   npm run db:create
   npm run db:migrate
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint with auto-fix |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npm run db:create` | Create database |
| `npm run db:generate` | Generate migrations |
| `npm run db:migrate` | Run migrations |
| `npm run db:push` | Push schema changes |

## Environment Variables

### Required Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/moodio

# Authentication
JWT_ACCESS_SECRET=your-jwt-secret-key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# AWS S3 & CloudFront
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-2
AWS_S3_BUCKET_NAME=your-bucket-name
CLOUDFRONT_PRIVATE_KEY=your-private-key
CLOUDFRONT_DOMAIN=your-cloudfront-domain
CLOUDFRONT_KEY_PAIR_ID=your-key-pair-id
CLOUDFRONT_COOKIE_DOMAIN=.yourdomain.com

# AI APIs
LLM_API_KEY=your-openai-api-key
GOOGLE_API_KEY=your-google-api-key
FAL_API_KEY=your-fal-api-key
FAL_ADMIN_KEY=your-fal-admin-key
```

### Optional Variables

```env
# Maintenance mode
MAINTENANCE_MODE=false

# External services
NEXT_PUBLIC_FLASK_URL=http://localhost:5000
NEXT_PUBLIC_CLOUDFRONT_URL=https://cdn.yourdomain.com
```

## Database Setup

### Schema Overview

The database uses Drizzle ORM with PostgreSQL. Key tables include:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles and auth provider info |
| `otps` | One-time passwords for email verification |
| `refresh_tokens` | JWT refresh token storage |
| `passkeys` | WebAuthn credentials |
| `chats` | Chat session metadata |
| `projects` | Top-level asset containers |
| `collections` | Shareable folders within projects |
| `collection_images` | Assets (images/videos) with generation details |
| `collection_shares` | Sharing permissions |
| `video_generations` | Video generation requests and results |
| `user_credits` | Credit balances |
| `credit_transactions` | Credit transaction history |
| `model_pricing` | Admin-configurable pricing formulas |
| `events` | Telemetry data |

### Running Migrations

```bash
# Generate new migration from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Push schema directly (development only)
npm run db:push

# Open database GUI
npm run db:studio
```

## API Reference

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/request-otp` | Request OTP via email |
| POST | `/api/auth/verify-otp` | Verify OTP and get tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout and invalidate tokens |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/passkey/register/options` | Get passkey registration options |
| POST | `/api/auth/passkey/register/verify` | Complete passkey registration |
| POST | `/api/auth/passkey/login/options` | Get passkey login options |
| POST | `/api/auth/passkey/login/verify` | Complete passkey login |

### Chat Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chat` | List user's chats |
| POST | `/api/chat` | Create new chat |
| GET | `/api/chat/[chatId]` | Get chat with messages |
| PATCH | `/api/chat/[chatId]` | Update chat (rename/delete) |
| POST | `/api/chat/[chatId]/message` | Send message to agent |
| POST | `/api/chat/[chatId]/fork` | Fork chat from message |

### Video Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/video/models` | List available video models |
| GET | `/api/video/cost` | Calculate generation cost |
| POST | `/api/video/generate` | Start video generation |
| GET | `/api/video/generations` | List user's generations |
| GET | `/api/video/generations/[id]` | Get generation details |
| GET | `/api/video/generations/[id]/download` | Download video |
| POST | `/api/video/webhook` | Fal.ai webhook handler |

### Image Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/image/upload/presign` | Get presigned S3 URL |
| POST | `/api/image/upload/confirm` | Confirm upload completion |
| GET | `/api/image/[imageId]` | Get CloudFront URL |
| GET | `/api/image/[imageId]/download` | Download image |

### Collection Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/collection` | List collections |
| POST | `/api/collection` | Create collection |
| GET | `/api/collection/[id]` | Get collection with assets |
| PATCH | `/api/collection/[id]` | Rename collection |
| DELETE | `/api/collection/[id]` | Delete collection |
| POST | `/api/collection/[id]/images` | Add image/video to collection |
| PATCH | `/api/collection/[id]/images/[itemId]` | Update item (rename) |
| DELETE | `/api/collection/[id]/images/[itemId]` | Remove item from collection |
| POST | `/api/collection/[id]/images/[itemId]/transfer` | Move/copy item to another collection |
| POST | `/api/collection/[id]/share` | Share collection |
| DELETE | `/api/collection/[id]/share/[userId]` | Remove share |

> **Note**: `[itemId]` refers to the unique record ID (`collection_images.id`), not the `imageId`. This ensures correct identification when multiple videos share the same thumbnail image.

### Admin Endpoints

All admin endpoints require the `admin` role.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/[id]` | Update user |
| POST | `/api/admin/credits` | Grant/deduct credits |
| GET | `/api/admin/credit-transactions` | List transactions |
| GET/POST | `/api/admin/pricing` | Manage pricing formulas |
| GET | `/api/admin/chats` | List all chats |
| GET | `/api/admin/video-generations` | List all generations |
| GET | `/api/admin/fal-usage` | Fal.ai usage stats |
| GET | `/api/admin/events` | Telemetry events |

## AI Agent System

### Agent Architecture

The platform uses a sophisticated AI agent system (`Agent1`) that processes user requests through multiple stages:

1. **Message Preparation**: Filters conversation history, prepares images, and constructs the prompt
2. **LLM Processing**: Streams response from GPT-4.1 with structured output parsing
3. **Image Generation**: Parallel generation of up to 8 image suggestions
4. **Response Assembly**: Combines text response with generated images

### Structured Thinking Process

The agent uses a structured thinking block before responding:

```
<think>
belief_prompt: User's current intent based on recent interactions
user_intention: Predicted immediate goal for next round
user_preference: Session-specific preferences and dislikes
user_persona: Long-term, persistent user preferences
</think>
```

### Parallel Variant Generation

The agent supports generating multiple response variants simultaneously:

```typescript
// Generate 2 parallel variants
const response = await agent.processRequestParallel(
  history,
  userMessage,
  userId,
  isAdmin,
  variantCount: 2
);
```

### Response Format

Agent responses include:
- **Text**: Conversational response with follow-up questions
- **Suggestions**: Up to 8 image generation prompts with titles and aspect ratios
- **Images**: Generated images with status tracking (loading → generated/error)

## Video Generation

### Supported Models

| Model | Provider | Features |
|-------|----------|----------|
| Seedance v1.5 Pro | ByteDance | 4-12s, audio, 480p-1080p |
| Hailuo 2.3 Pro | MiniMax | 1080p, prompt optimizer |
| Hailuo 2.3 Fast Pro | MiniMax | Fast generation, 1080p |
| Hailuo 02 Pro | MiniMax | First-last frame support |
| Wan v2.6 | - | 5-15s, multi-shot segmentation |
| Kling Video v2.6 Pro | - | Cinematic, native audio |
| Kling O1 Pro | - | First-last frame animation |
| Veo 3.1 | Google DeepMind | 4K, 4-8s, audio |
| Veo 3.1 First-Last | Google DeepMind | Frame interpolation |
| Sora 2 Pro | OpenAI | 4-12s, high quality |

### Generation Flow

1. **Cost Calculation**: Dynamic pricing based on model and parameters
2. **Credit Deduction**: Upfront charge before generation
3. **Fal.ai Submission**: Async job submission with webhook URL
4. **Progress Tracking**: Real-time status updates via webhooks
5. **Completion**: Video stored in S3, thumbnail generated
6. **Failure Handling**: Automatic credit refund on errors

### Parameter Validation

The system uses a "replace and fill" strategy:
- User parameters are validated against model schema
- Missing optional parameters use defaults
- Hidden parameters are always set to defaults
- Disabled parameters are excluded entirely

## Image Generation

### Supported Models

| Model | Provider | Capabilities |
|-------|----------|--------------|
| Nano-banana Pro | Google (Gemini 3 Pro) | Generate + Edit |
| Seedream 4.5 | ByteDance (Fal.ai) | Generate + Edit |

### Generation Modes

1. **Text-to-Image**: Generate images from text prompts
2. **Image Editing**: Modify existing images based on prompts
3. **Precision Editing**: Fine-grained edits with reference images

### Aspect Ratios

Supported ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

### Image Sizes

- **2K**: Standard quality (default)
- **4K**: High resolution output

## Credits System

### Overview

The platform uses a credit-based billing system where users spend credits on video generation. Credits are managed through:

- **Balance Tracking**: Per-user credit balance
- **Transaction History**: Complete audit trail
- **Dynamic Pricing**: Admin-configurable formulas per model

### Pricing Formulas

Pricing uses `expr-eval` for safe formula evaluation:

```javascript
// Example formula for video generation
"100 * (resolution == '1080p' ? 1.5 : 1) + (generate_audio ? 50 : 0)"

// Variables available:
// - All model parameters (resolution, duration, etc.)
// - Booleans converted to 1/0
```

### Credit Operations

```typescript
// Get balance
const balance = await getUserBalance(userId);

// Deduct credits
await deductCredits(userId, amount, 'video_generation', description, relatedEntity);

// Grant credits (admin)
await grantCredits(userId, amount, 'admin_grant', description, performedBy);

// Refund on failure
await refundCharge(relatedEntity, reason);
```

## Authentication

### Authentication Flow

1. **Email OTP**:
   - User enters email → OTP sent via SMTP
   - OTP verified → JWT tokens issued
   - Access token (30 min) + Refresh token (20 days)

2. **Passkey (WebAuthn)**:
   - Registration: Generate challenge → User creates credential → Store public key
   - Login: Generate challenge → User signs → Verify signature → Issue tokens

### Token Management

- **Access Token**: Short-lived JWT in HTTP-only cookie
- **Refresh Token**: Long-lived, single-use, stored in database
- **CloudFront Cookies**: Signed cookies for CDN access (30 min expiry)

### Role-Based Access

| Role | Permissions |
|------|-------------|
| `new_user` | Default role, limited access |
| `user` | Full platform access |
| `admin` | Admin panel access |

## Admin Panel

### Features

1. **User Management**
   - View all users with credits and roles
   - Edit user information
   - Grant/deduct credits
   - Send invitation emails

2. **Chat Management**
   - View all chat sessions
   - Search by user or content
   - Monitor chat activity

3. **Video Management**
   - Track all video generations
   - Filter by status/model
   - View generation details and errors

4. **Credit Transactions**
   - Complete transaction history
   - Summary statistics
   - Filter by type

5. **Pricing Management**
   - Create/edit pricing formulas
   - Formula validation with test parameters
   - Per-model configuration

6. **Fal.ai Usage**
   - Track API usage and costs
   - Filter by time range
   - Endpoint-level breakdown

7. **Events/Telemetry**
   - View system events
   - Filter by event type
   - Inspect event metadata

8. **System Management**
   - Cleanup expired tokens
   - Database maintenance

## Project Structure

```
moodio-agent/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Dashboard pages
│   │   ├── admin/                # Admin panel pages
│   │   ├── browse/               # Content browsing
│   │   ├── chat/                 # Chat interface
│   │   ├── collection/           # Collection management
│   │   ├── credits/              # Credit balance
│   │   ├── profile/              # User profile
│   │   ├── projects/             # Project management
│   │   └── storyboard/           # Video generation
│   ├── api/                      # API routes
│   │   ├── admin/                # Admin endpoints
│   │   ├── auth/                 # Authentication
│   │   ├── chat/                 # Chat endpoints
│   │   ├── collection/           # Collection endpoints
│   │   ├── image/                # Image endpoints
│   │   ├── projects/             # Project endpoints
│   │   ├── users/                # User endpoints
│   │   └── video/                # Video endpoints
│   └── auth/                     # Auth pages
├── components/                   # Shared React components
├── config/                       # App configuration
├── drizzle/                      # Database migrations
├── hooks/                        # Custom React hooks
├── i18n/                         # Internationalization
├── lib/                          # Core libraries
│   ├── agents/                   # AI agent system
│   ├── api/                      # API client
│   ├── auth/                     # Authentication utilities
│   ├── config/                   # Configuration
│   ├── db/                       # Database schema & queries
│   ├── image/                    # Image generation
│   ├── llm/                      # LLM providers
│   ├── providers/                # React providers
│   ├── redux/                    # Redux store & slices
│   ├── storage/                  # S3 utilities
│   ├── upload/                   # Upload utilities
│   └── video/                    # Video generation
├── messages/                     # i18n message files
├── public/                       # Static assets
├── scripts/                      # Utility scripts
├── styles/                       # Global styles
└── types/                        # TypeScript types
```

## Development

### Code Style

- ESLint with auto-fix enabled
- Prettier for formatting
- TypeScript strict mode

### Running Locally

```bash
# Development with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Database Development

```bash
# Open Drizzle Studio for database inspection
npm run db:studio

# Generate migration after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate
```

### Testing Webhooks Locally

For video generation webhooks, use a tunnel service like ngrok:

```bash
ngrok http 3000
# Update FAL webhook URL to use ngrok URL
```

## Deployment

### Docker

A Dockerfile is provided for containerized deployment:

```bash
docker build -t moodio-agent .
docker run -p 3000:3000 --env-file .env moodio-agent
```

### Production Build

```bash
npm run build
npm run start
```

### Environment Considerations

- Ensure all required environment variables are set
- Configure CloudFront for production domain
- Set up proper CORS headers for API routes
- Enable maintenance mode during deployments if needed

### Health Checks

The application exposes a test endpoint for health checks:
- `GET /api/test/protected` - Returns 200 if authenticated

---

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]

## Support

[Add support information here]
