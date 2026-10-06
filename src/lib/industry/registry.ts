import type { IndustryProfile } from './types';

export const INDUSTRY_PROFILES: Record<string, IndustryProfile> = {
  lending: {
    key: 'lending', label: 'Lending', tagline: 'Loan CRM Platform',
    businessTypes: { lending: { label: 'Lending' } },
    labels: {
      workspace: { singular: 'Workspace', plural: 'Workspace' },
      lead: { singular: 'Lead', plural: 'Leads' },
      contact: { singular: 'Contact', plural: 'Contacts' },
      campaign: { singular: 'Campaign', plural: 'Campaigns' },
      pipeline: { singular: 'Pipeline', plural: 'Pipeline' },
      appointment: { singular: 'Appointment', plural: 'Appointments' },
      agent: { singular: 'Loan Agent', plural: 'Loan Agents' },
      enquiry: { singular: 'Enquiry', plural: 'Enquiries' },
      deal: { singular: 'Loan', plural: 'Loans' },
    },
    modules: [],
    pipeline: {
      key: 'lending', label: 'Loan Pipeline',
      stages: [
        { key: 'contact', label: 'Contact', order: 10 },
        { key: 'campaign', label: 'Campaign', order: 20 },
        { key: 'lead', label: 'Lead', order: 30 },
        { key: 'opportunity', label: 'Opportunity', order: 40 },
        { key: 'client', label: 'Client', order: 50, terminal: 'won' },
      ],
    },
  },
  automotive: {
    key: 'automotive', label: 'Automotive', tagline: 'Automotive CRM Platform',
    businessTypes: {
      vehicle_dealership: { label: 'Vehicle Dealership' },
      used_vehicle_dealership: { label: 'Used Vehicle Dealership' },
      service_center: { label: 'Service Center' },
    },
    labels: {
      workspace: { singular: 'Dealership', plural: 'Dealership' },
      lead: { singular: 'Vehicle Enquiry', plural: 'Vehicle Enquiries' },
      contact: { singular: 'Customer', plural: 'Customers' },
      campaign: { singular: 'Sales Campaign', plural: 'Sales Campaigns' },
      pipeline: { singular: 'Sales Pipeline', plural: 'Sales Pipeline' },
      appointment: { singular: 'Test Drive', plural: 'Test Drives' },
      agent: { singular: 'Sales Executive', plural: 'Sales Executives' },
      enquiry: { singular: 'Vehicle Enquiry', plural: 'Vehicle Enquiries' },
      deal: { singular: 'Vehicle Sale', plural: 'Vehicle Sales' },
    },
    modules: [
      { key: 'vehicle_inventory', label: 'Vehicle Inventory', route: '/vehicles', domainSpecific: true },
      { key: 'test_drives', label: 'Test Drives', route: '/test-drives', domainSpecific: true },
      { key: 'quotations', label: 'Quotations', route: '/quotations', domainSpecific: true },
      { key: 'bookings', label: 'Bookings', route: '/bookings', domainSpecific: true },
      { key: 'vehicle_sales', label: 'Vehicle Sales', route: '/vehicle-sales', domainSpecific: true },
    ],
    pipeline: {
      key: 'vehicle_sales', label: 'Vehicle Sales',
      stages: [
        { key: 'new_enquiry', label: 'New Enquiry', order: 10 },
        { key: 'contacted', label: 'Contacted', order: 20 },
        { key: 'qualified', label: 'Qualified', order: 30 },
        { key: 'vehicle_selected', label: 'Vehicle Selected', order: 40 },
        { key: 'test_drive', label: 'Test Drive', order: 50 },
        { key: 'quotation', label: 'Quotation', order: 60 },
        { key: 'negotiation', label: 'Negotiation', order: 70 },
        { key: 'booking', label: 'Booking', order: 80 },
        { key: 'finance', label: 'Finance', order: 90 },
        { key: 'delivery', label: 'Delivery', order: 100 },
        { key: 'won', label: 'Sold', order: 110, terminal: 'won' },
        { key: 'lost', label: 'Lost', order: 120, terminal: 'lost' },
      ],
    },
    metadata: {
      objectKeys: {
        customer: 'contact', enquiry: 'vehicle_enquiry', vehicle: 'vehicle',
        testDrive: 'test_drive', quotation: 'vehicle_quotation',
        booking: 'vehicle_booking', sale: 'vehicle_sale',
      },
    },
  },
};

export const DEFAULT_INDUSTRY_KEY = 'lending';

export function getIndustryProfile(industry?: string | null): IndustryProfile {
  return INDUSTRY_PROFILES[industry || DEFAULT_INDUSTRY_KEY]
    || INDUSTRY_PROFILES[DEFAULT_INDUSTRY_KEY];
}
