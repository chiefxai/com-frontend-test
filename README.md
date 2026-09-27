# ChiefVoice CRM — Frontend

Vite + React + TypeScript frontend for the ChiefVoice CRM platform. The frontend is a standalone application that communicates with the CRM backend over HTTP.

## Tech stack

- React + TypeScript
- Vite
- Tailwind CSS
- AWS Cognito authentication
- REST API integration with the CRM backend

## Local development

```bash
npm install
npm run dev
```

The Vite development server runs on `http://localhost:5173`. Configure `VITE_API_URL` to point to the backend API.

Start the backend separately in its own repository/terminal.

## Environment variables

Copy the production example and configure the values for your environment:

```bash
cp .env.production.example .env.local
```

Required frontend configuration:

| Variable | Purpose |
|---|---|
| `VITE_AUTH_PROVIDER` | Authentication provider; currently `cognito` |
| `VITE_COGNITO_REGION` | AWS Cognito region |
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | Cognito app client ID |
| `VITE_COGNITO_DOMAIN` | Cognito Hosted UI domain |
| `VITE_COGNITO_REDIRECT_SIGN_IN` | Sign-in callback URL |
| `VITE_COGNITO_REDIRECT_SIGN_OUT` | Sign-out callback URL |
| `VITE_API_URL` | CRM backend API URL |
| `VITE_APP_ENV` | Frontend environment |

All `VITE_*` values are browser-visible configuration. **Never put backend secrets or private credentials in frontend environment variables.**

## Build

```bash
npm run build
```

The production build is generated in `dist/` and can be deployed to a static hosting platform such as Vercel, Netlify, or Cloudflare Pages.

## Main application areas

The frontend provides the CRM workspace and platform administration UI, including:

- Dashboard and reporting
- Campaigns and voice simulators
- Leads, enquiries, contact directory, and pipeline
- Call logs and scheduled callbacks
- Agent Studio and dialing tasks
- Workflow Builder
- Knowledge Base and retrieval testing
- Compliance and DNC management
- Audit Log
- Platform administration and organization management
- Authentication through AWS Cognito

## UI architecture

The application uses reusable UI primitives and shared components for consistent behavior across the CRM, including:

- `PageShell` — page-level layout and actions
- `Widget` — dashboard/content containers
- `KpiCard` — reusable KPI cards with responsive layouts
- `DataTable` — shared table, scrolling, and pagination behavior
- `FilterBar` / `FilterDropdown` — shared filtering patterns
- `Button`, `Modal`, `Badge`, and other common UI components

Knowledge Base and Compliance use the shared KPI component, and the Knowledge Base section supports a responsive collapsible content area.

## Production deployment

The frontend can be deployed independently from the backend. For Vercel:

1. Connect the GitHub repository.
2. Use the repository root as the project root unless your deployment setup specifies another directory.
3. Configure the required `VITE_*` environment variables in the Vercel project.
4. Run the production build with `npm run build`.

The frontend only needs the backend API URL and public authentication configuration at build/runtime. Backend secrets remain on the server.

## Repository

GitHub: https://github.com/chiefxai/com-frontend-test
