# Industry Configuration Architecture

The industry layer separates stable CRM concepts from industry-specific presentation and modules.

Rules:
1. Use stable internal keys (lead, contact, vehicle, test_drive, etc.).
2. Put customer-facing terminology in an industry profile.
3. Put genuinely domain-specific modules in the profile modules collection.
4. Do not branch reusable components with industry checks when a profile value can express the behavior.
5. Add a new industry by registering a new IndustryProfile; existing CRM components should not be copied.
6. Organization industry and businessType select the profile; they are not feature flags.
7. Feature flags answer whether a capability is enabled; industry profiles answer what that capability means for the business.

Automotive / vehicle_dealership provides terminology, a vehicle-sales pipeline, and domain modules such as Vehicle Inventory, Test Drives, Quotations, Bookings, and Vehicle Sales.
