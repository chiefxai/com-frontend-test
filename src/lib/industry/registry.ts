import type { IndustryProfile } from './types';
import type { IndustryDomainModel } from './domain';

export const CORE_DOMAIN_MODEL: IndustryDomainModel = {
  objects: [
    { key: 'contact', label: 'Contact', pluralLabel: 'Contacts', searchable: true, auditable: true, primary: true, fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'email', label: 'Email', type: 'email' },
    ] },
    { key: 'campaign', label: 'Campaign', pluralLabel: 'Campaigns', auditable: true, fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'status', label: 'Status', type: 'select' },
    ] },
    { key: 'call', label: 'Call', pluralLabel: 'Calls', auditable: true, fields: [
      { key: 'direction', label: 'Direction', type: 'select', options: ['inbound', 'outbound'] },
      { key: 'duration', label: 'Duration', type: 'number' },
    ] },
  ],
  relationships: [
    { from: 'campaign', to: 'contact', type: 'many_to_many', label: 'targets' },
    { from: 'call', to: 'contact', type: 'many_to_one', label: 'contact' },
  ],
};

export const AUTOMOTIVE_DOMAIN_MODEL: IndustryDomainModel = {
  ...CORE_DOMAIN_MODEL,
  objects: [
    ...CORE_DOMAIN_MODEL.objects,
    { key: 'vehicle', label: 'Vehicle', pluralLabel: 'Vehicles', searchable: true, auditable: true, fields: [
      { key: 'vin', label: 'VIN', type: 'text' },
      { key: 'make', label: 'Make', type: 'text' },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'year', label: 'Year', type: 'number' },
      { key: 'price', label: 'Price', type: 'currency' },
      { key: 'status', label: 'Status', type: 'select', options: ['available', 'reserved', 'sold'] },
    ] },
    { key: 'test_drive', label: 'Test Drive', pluralLabel: 'Test Drives', auditable: true, fields: [
      { key: 'scheduledAt', label: 'Scheduled At', type: 'datetime', required: true },
      { key: 'vehicleId', label: 'Vehicle', type: 'relation', relationObjectKey: 'vehicle' },
      { key: 'contactId', label: 'Customer', type: 'relation', relationObjectKey: 'contact' },
    ] },
    { key: 'vehicle_quotation', label: 'Quotation', pluralLabel: 'Quotations', auditable: true, fields: [
      { key: 'vehicleId', label: 'Vehicle', type: 'relation', relationObjectKey: 'vehicle' },
      { key: 'amount', label: 'Amount', type: 'currency' },
    ] },
    { key: 'vehicle_booking', label: 'Booking', pluralLabel: 'Bookings', auditable: true, fields: [
      { key: 'vehicleId', label: 'Vehicle', type: 'relation', relationObjectKey: 'vehicle' },
      { key: 'contactId', label: 'Customer', type: 'relation', relationObjectKey: 'contact' },
    ] },
    { key: 'vehicle_sale', label: 'Vehicle Sale', pluralLabel: 'Vehicle Sales', auditable: true, fields: [
      { key: 'vehicleId', label: 'Vehicle', type: 'relation', relationObjectKey: 'vehicle' },
      { key: 'contactId', label: 'Customer', type: 'relation', relationObjectKey: 'contact' },
      { key: 'amount', label: 'Sale Amount', type: 'currency' },
    ] },
  ],
  relationships: [
    ...CORE_DOMAIN_MODEL.relationships,
    { from: 'test_drive', to: 'vehicle', type: 'many_to_one' },
    { from: 'test_drive', to: 'contact', type: 'many_to_one' },
    { from: 'vehicle_quotation', to: 'vehicle', type: 'many_to_one' },
    { from: 'vehicle_booking', to: 'vehicle', type: 'many_to_one' },
    { from: 'vehicle_booking', to: 'contact', type: 'many_to_one' },
    { from: 'vehicle_sale', to: 'vehicle', type: 'many_to_one' },
    { from: 'vehicle_sale', to: 'contact', type: 'many_to_one' },
  ],
};

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
    modules: [
      { key: 'loan_lifecycle', label: 'Loan Lifecycle', route: '/loans', tabId: 'loans', iconKey: 'layers', domainSpecific: true },
    ],
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
    // These automotive records are implemented in the shared Custom Objects
    // workspace. Give that view a sidebar tab so the domain objects are
    // reachable; it contains tabs for vehicles, test drives, quotations,
    // bookings, and sales.
    modules: [
      { key: 'automotive_records', label: 'Vehicle Operations', route: '/objects', tabId: 'objects', featureFlag: 'objects', domainSpecific: true },
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
    domainModel: AUTOMOTIVE_DOMAIN_MODEL,
    metadata: {
      objectKeys: {
        customer: 'contact', enquiry: 'vehicle_enquiry', vehicle: 'vehicle',
        testDrive: 'test_drive', quotation: 'vehicle_quotation',
        booking: 'vehicle_booking', sale: 'vehicle_sale',
      },
    },
  },
};


function createPackProfile(
  key: string,
  label: string,
  tagline: string,
  businessTypeKey: string,
  businessTypeLabel: string,
  labels: IndustryProfile['labels'],
  stages: IndustryProfile['pipeline']['stages'],
): IndustryProfile {
  const recordModuleLabels: Record<string, string> = {
    real_estate: 'Property Records',
    healthcare: 'Patient Records',
    insurance: 'Policy & Claims',
    education: 'Admissions',
    ecommerce: 'Orders',
    field_services: 'Service Jobs',
    it_sales: 'Sales Opportunities',
  };
  return {
    key,
    label,
    tagline,
    businessTypes: { [businessTypeKey]: { label: businessTypeLabel } },
    labels,
    modules: [{
      key: `${key}_records`,
      label: recordModuleLabels[key] || `${label} Records`,
      route: '/objects',
      tabId: 'objects',
      featureFlag: 'objects',
      domainSpecific: true,
    }],
    pipeline: { key, label: labels.pipeline.plural, stages },
    domainModel: CORE_DOMAIN_MODEL,
  };
}

const GENERIC_PACK_PROFILES: Record<string, IndustryProfile> = {
  real_estate: createPackProfile(
    'real_estate',
    'Real Estate',
    'AI-powered property enquiries, visits, and deal management.',
    'real_estate_agency',
    'Real Estate Agency',
    {
      workspace: { singular: 'Agency', plural: 'Agencies' },
      lead: { singular: 'Property Lead', plural: 'Property Leads' },
      contact: { singular: 'Contact', plural: 'Contacts' },
      campaign: { singular: 'Campaign', plural: 'Campaigns' },
      pipeline: { singular: 'Sales Pipeline', plural: 'Sales Pipeline' },
      appointment: { singular: 'Site Visit', plural: 'Site Visits' },
      agent: { singular: 'Agent', plural: 'Agents' },
      enquiry: { singular: 'Property Enquiry', plural: 'Property Enquiries' },
      deal: { singular: 'Property Deal', plural: 'Property Deals' },
    },
    [
      { key: 'enquiry', label: 'Enquiry', order: 10 },
      { key: 'site_visit_scheduled', label: 'Site Visit Scheduled', order: 20 },
      { key: 'site_visit_done', label: 'Site Visit Done', order: 30 },
      { key: 'negotiation', label: 'Negotiation', order: 40 },
      { key: 'booked', label: 'Booked', order: 50, terminal: 'won' },
      { key: 'lost', label: 'Lost', order: 60, terminal: 'lost' },
    ],
  ),
  healthcare: createPackProfile(
    'healthcare',
    'Healthcare',
    'AI-powered patient communication and appointment workflows.',
    'clinic',
    'Clinic',
    {
      workspace: { singular: 'Clinic', plural: 'Clinics' },
      lead: { singular: 'Patient Enquiry', plural: 'Patient Enquiries' },
      contact: { singular: 'Patient', plural: 'Patients' },
      campaign: { singular: 'Outreach Campaign', plural: 'Outreach Campaigns' },
      pipeline: { singular: 'Care Pipeline', plural: 'Care Pipeline' },
      appointment: { singular: 'Appointment', plural: 'Appointments' },
      agent: { singular: 'Care Representative', plural: 'Care Representatives' },
      enquiry: { singular: 'Patient Enquiry', plural: 'Patient Enquiries' },
      deal: { singular: 'Care Case', plural: 'Care Cases' },
    },
    [
      { key: 'enquiry', label: 'Enquiry', order: 10 },
      { key: 'appointment_booked', label: 'Appointment Booked', order: 20 },
      { key: 'consulted', label: 'Consulted', order: 30 },
      { key: 'follow_up', label: 'Follow-up', order: 40 },
      { key: 'discharged', label: 'Discharged', order: 50, terminal: 'won' },
    ],
  ),
  insurance: createPackProfile(
    'insurance',
    'Insurance',
    'AI-powered insurance enquiries, follow-ups, and policy workflows.',
    'insurance_agency',
    'Insurance Agency',
    {
      workspace: { singular: 'Agency', plural: 'Agencies' },
      lead: { singular: 'Policyholder Lead', plural: 'Policyholder Leads' },
      contact: { singular: 'Policyholder', plural: 'Policyholders' },
      campaign: { singular: 'Campaign', plural: 'Campaigns' },
      pipeline: { singular: 'Policy Pipeline', plural: 'Policy Pipeline' },
      appointment: { singular: 'Appointment', plural: 'Appointments' },
      agent: { singular: 'Insurance Agent', plural: 'Insurance Agents' },
      enquiry: { singular: 'Coverage Enquiry', plural: 'Coverage Enquiries' },
      deal: { singular: 'Policy', plural: 'Policies' },
    },
    [
      { key: 'enquiry', label: 'Enquiry', order: 10 },
      { key: 'quote_sent', label: 'Quote Sent', order: 20 },
      { key: 'documents_pending', label: 'Documents Pending', order: 30 },
      { key: 'policy_issued', label: 'Policy Issued', order: 40, terminal: 'won' },
      { key: 'lost', label: 'Lost', order: 50, terminal: 'lost' },
    ],
  ),
  education: createPackProfile(
    'education',
    'Education',
    'AI-powered admissions, counselling, and enrollment workflows.',
    'educational_institution',
    'Educational Institution',
    {
      workspace: { singular: 'Institution', plural: 'Institutions' },
      lead: { singular: 'Admission Enquiry', plural: 'Admission Enquiries' },
      contact: { singular: 'Student', plural: 'Students' },
      campaign: { singular: 'Outreach Campaign', plural: 'Outreach Campaigns' },
      pipeline: { singular: 'Admissions Pipeline', plural: 'Admissions Pipeline' },
      appointment: { singular: 'Counselling', plural: 'Counselling' },
      agent: { singular: 'Admissions Counselor', plural: 'Admissions Counselors' },
      enquiry: { singular: 'Admission Enquiry', plural: 'Admission Enquiries' },
      deal: { singular: 'Enrollment', plural: 'Enrollments' },
    },
    [
      { key: 'enquiry', label: 'Enquiry', order: 10 },
      { key: 'counselling_scheduled', label: 'Counselling Scheduled', order: 20 },
      { key: 'counselling_done', label: 'Counselling Done', order: 30 },
      { key: 'fee_pending', label: 'Fee Pending', order: 40 },
      { key: 'enrolled', label: 'Enrolled', order: 50, terminal: 'won' },
      { key: 'rejected', label: 'Rejected', order: 60, terminal: 'lost' },
    ],
  ),
  ecommerce: createPackProfile(
    'ecommerce',
    'E-commerce / D2C',
    'AI-powered customer conversations from enquiry through delivery.',
    'online_store',
    'Online Store',
    {
      workspace: { singular: 'Store', plural: 'Stores' },
      lead: { singular: 'Order Lead', plural: 'Order Leads' },
      contact: { singular: 'Customer', plural: 'Customers' },
      campaign: { singular: 'Campaign', plural: 'Campaigns' },
      pipeline: { singular: 'Order Pipeline', plural: 'Order Pipeline' },
      appointment: { singular: 'Appointment', plural: 'Appointments' },
      agent: { singular: 'Sales Agent', plural: 'Sales Agents' },
      enquiry: { singular: 'Product Enquiry', plural: 'Product Enquiries' },
      deal: { singular: 'Order', plural: 'Orders' },
    },
    [
      { key: 'new', label: 'New', order: 10 },
      { key: 'confirmed', label: 'Confirmed', order: 20 },
      { key: 'packed', label: 'Packed', order: 30 },
      { key: 'shipped', label: 'Shipped', order: 40 },
      { key: 'delivered', label: 'Delivered', order: 50, terminal: 'won' },
      { key: 'returned', label: 'Returned', order: 60, terminal: 'lost' },
    ],
  ),
  field_services: createPackProfile(
    'field_services',
    'Field Services',
    'AI-powered service enquiries, scheduling, and job management.',
    'service_business',
    'Service Business',
    {
      workspace: { singular: 'Service Business', plural: 'Service Businesses' },
      lead: { singular: 'Service Lead', plural: 'Service Leads' },
      contact: { singular: 'Customer', plural: 'Customers' },
      campaign: { singular: 'Service Campaign', plural: 'Service Campaigns' },
      pipeline: { singular: 'Service Pipeline', plural: 'Service Pipeline' },
      appointment: { singular: 'Service Appointment', plural: 'Service Appointments' },
      agent: { singular: 'Field Agent', plural: 'Field Agents' },
      enquiry: { singular: 'Service Enquiry', plural: 'Service Enquiries' },
      deal: { singular: 'Job', plural: 'Jobs' },
    },
    [
      { key: 'booked', label: 'Booked', order: 10 },
      { key: 'assigned', label: 'Assigned', order: 20 },
      { key: 'in_progress', label: 'In Progress', order: 30 },
      { key: 'completed', label: 'Completed', order: 40, terminal: 'won' },
      { key: 'cancelled', label: 'Cancelled', order: 50, terminal: 'lost' },
    ],
  ),
  it_sales: createPackProfile(
    'it_sales',
    'IT / SaaS Sales',
    'AI-powered B2B sales conversations and deal workflows.',
    'software_company',
    'Software Company',
    {
      workspace: { singular: 'Company', plural: 'Companies' },
      lead: { singular: 'Sales Lead', plural: 'Sales Leads' },
      contact: { singular: 'Contact', plural: 'Contacts' },
      campaign: { singular: 'Sales Campaign', plural: 'Sales Campaigns' },
      pipeline: { singular: 'Sales Pipeline', plural: 'Sales Pipeline' },
      appointment: { singular: 'Demo', plural: 'Demos' },
      agent: { singular: 'Sales Executive', plural: 'Sales Executives' },
      enquiry: { singular: 'Product Enquiry', plural: 'Product Enquiries' },
      deal: { singular: 'Deal', plural: 'Deals' },
    },
    [
      { key: 'enquiry', label: 'Enquiry', order: 10 },
      { key: 'demo_scheduled', label: 'Demo Scheduled', order: 20 },
      { key: 'demo_done', label: 'Demo Done', order: 30 },
      { key: 'proposal_sent', label: 'Proposal Sent', order: 40 },
      { key: 'won', label: 'Won', order: 50, terminal: 'won' },
      { key: 'lost', label: 'Lost', order: 60, terminal: 'lost' },
    ],
  ),
};

export const DEFAULT_INDUSTRY_KEY = 'lending';

Object.assign(INDUSTRY_PROFILES, GENERIC_PACK_PROFILES);

export function getIndustryProfile(industry?: string | null): IndustryProfile {
  return INDUSTRY_PROFILES[industry || DEFAULT_INDUSTRY_KEY]
    || INDUSTRY_PROFILES[DEFAULT_INDUSTRY_KEY];
}
