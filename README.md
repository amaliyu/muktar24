# APC Manager - Abuja Precast Concrete Operations Dashboard

A modern React dashboard for managing precast concrete block production, orders, staff, and logistics operations.

## Getting Started

### Prerequisites
- Node.js 16+ and npm installed

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
This starts the Vite dev server at `http://localhost:5173` with hot reload enabled.

### Build for Production
```bash
npm run build
npm run preview
```

## Testing

### Run Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

### Interactive Test UI
```bash
npm run test:ui
```

## Project Structure

```
src/
├── App.jsx           # Main application component with all pages
├── main.jsx          # React entry point
└── test/
    └── setup.js      # Vitest configuration
```

## Pages

- **Dashboard** - Overview of production, orders, revenue, and damages
- **Production** - Daily production logging, material usage tracking
- **Orders** - Customer orders, invoicing, payment tracking
- **Staff** - Staff management directory
- **Waybills** - Delivery tracking records
- **Reports** - PDF/Excel report generation interface

## Key Features

- Responsive dark-themed UI with Abuja Precast branding
- Real-time statistics and KPIs
- Production and material tracking
- Order management with payment status
- Staff payroll information
- Delivery/logistics tracking
- Report generation interface

## Technology Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Vitest** - Unit testing framework
- **React Testing Library** - Component testing utilities
- **ESLint** - Code quality

## Environment

- React 18.3+
- Node.js 16+
- npm 8+
