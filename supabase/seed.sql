-- ==============================================================================
-- URBANSCOPE - SEED DATA (development / demo only)
-- ==============================================================================
-- Taken from backend/supabase_schema.sql (section 8). Run automatically by
-- `supabase db reset` after all migrations. NOT applied by `supabase db push`.
--
-- Change from the original script: the duplicate users row (id 11) that reused
-- 'urbanscope.cvsu@gmail.com' with a plaintext password was dropped, because it
-- violates the UNIQUE(email) constraint and made the whole seed fail.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 8.1 Seed: Users (Admin Miriam Lobren & Clients)
-- Passwords:
--   urbanscope.cvsu@gmail.com -> urbanscope2026 (or urbanscope)
--   admin.realestate@gmail.com -> realestate2026
--   client@gmail.com        -> client123
-- ------------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, full_name, phone, role, license_number, avatar_url) VALUES
(
    1,
    'urbanscope.cvsu@gmail.com',
    'b91dfbecc4174a5caaa09dcb3a229bd8$e63fd67ec76ca851e88bcad117fa7ca803bb6015c0852e94d2da659ec48fc6cd',
    'Miriam Lobren',
    '+63 900 000 0000',
    'admin',
    'PRC-REBL #0023456',
    'assets/images/agent.jpg'
),
(
    2,
    'client@gmail.com',
    'e9705b77308841cf0438e44c4ffe5558$3bd6218d77fe579d417878e3e46ce1ea0df816ea49ec9e7d4ec2853e8ff49085',
    'Sample Client',
    '+63 912 345 6789',
    'client',
    NULL,
    'assets/images/agent.jpg'
),
(
    3,
    'sarah.j@gmail.com',
    NULL,
    'Sarah Jenkins',
    '+63 917 111 2233',
    'client',
    NULL,
    'assets/images/agent.jpg'
),
(
    4,
    'mark.cruz@gmail.com',
    NULL,
    'Mark Anthony Cruz',
    '+63 928 444 5566',
    'client',
    NULL,
    'assets/images/agent.jpg'
),
(
    5,
    'maria.santos@gmail.com',
    NULL,
    'Maria Elena Santos',
    '+63 905 777 8899',
    'client',
    NULL,
    'assets/images/agent.jpg'
);

ALTER SEQUENCE users_id_seq RESTART WITH 10;

-- ------------------------------------------------------------------------------
-- 8.2 Seed: Property Types
-- ------------------------------------------------------------------------------
INSERT INTO property_types (id, name, slug, description) VALUES
(1, 'Subdivision', 'subdivision', 'Gated suburban communities featuring standalone residences and security'),
(2, 'Villa', 'villa', 'Spacious luxury houses with landscaped yards and private architecture'),
(3, 'Condominium', 'condominium', 'Mid to high-rise residential buildings with shared amenities and security'),
(4, 'Townhouse', 'townhouse', 'Multi-floor modern residences sharing common side walls'),
(5, 'Triplex', 'triplex', 'Three-unit architectural residential developments with dedicated entries'),
(6, 'Single Attached', 'single-attached', 'Independent house with one boundary wall built against the property line');

ALTER SEQUENCE property_types_id_seq RESTART WITH 10;

-- ------------------------------------------------------------------------------
-- 8.3 Seed: Properties Catalog (4 Accredited Featured Properties)
-- ------------------------------------------------------------------------------
INSERT INTO properties (
    id, agent_id, property_type_id, title, subdivision_name,
    address, city, province, location, property_type,
    price, bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
    status, title_status, image_url, description, amenities, latitude, longitude
) VALUES
(
    1,
    1,
    4,
    'Casasuerte',
    'Casasuerte Phase 1',
    'Panungyanan Road',
    'Trece Martires City',
    'Cavite',
    'Barangay San Agustin, Trece Martires City, Cavite',
    'Townhouse',
    2500000.00,
    2,
    1,
    50.00,
    50.80,
    1,
    2,
    'Available',
    'Clean Title',
    'assets/images/casasuerte.jpg',
    'Casasuerte stands out as an attractive option for first-time homebuyers and modern families looking for a sustainable yet affordable home. The neighborhood is meticulously designed to support a growing community, featuring concrete, well-paved roads, a secured entrance gate, and pocket parks. Its standout selling point is that its units come equipped with a built-in solar power system, offering permanent, eco-friendly savings on monthly electricity bills.',
    'Gated Entrance, Clubhouse, Basketball Court, Parks & Playgrounds, Built-in Solar Power System, Paved Concrete Roads',
    14.28315,
    120.86832
),
(
    2,
    1,
    4,
    'Kathleen',
    'Kathleen',
    'Magdiwang Road / Marcos Alvarez Ext.',
    'Bacoor',
    'Cavite',
    'Molino 7, Bacoor, Cavite',
    'Townhouse',
    6200000.00,
    3,
    2,
    112.00,
    112.00,
    1,
    2,
    'Available',
    'Clean Title',
    'assets/images/kathleen-facade.jpg',
    'Kathleen is a secure, family-friendly residential community offering 275 premium townhouses in Molino VII, Bacoor, Cavite (border Las Pinas). Just 12 minutes from EVIA Lifestyle Center along Daang-Hari and MCX. This development features zen-inspired 2-storey townhouses with complete finishes including steel gates and modular cabinets in all rooms. The project offers quality units built to last, located in a thriving community with easy access to shopping centers, schools, hospitals, and major thoroughfares.',
    'Gated Entrance, Clubhouse, Park, Basketball Court, CCTV, Green-Oriented Community, Steel Gates Included, Modular Cabinets',
    14.41600,
    120.97500
),
(
    3,
    1,
    4,
    'Liora Homes',
    'Liora Homes Naic',
    'Brgy. Malainen Bago',
    'Naic',
    'Cavite',
    'Brgy. Malainen Bago, Naic, Cavite',
    'Townhouse',
    2462400.00,
    2,
    1,
    50.00,
    44.00,
    1,
    2,
    'Available',
    'Clean Title',
    'assets/images/LioraHomes.jpg',
    'Liora Homes Naic represents the next generation of housing developments by CBDI. Located in Brgy. Malainen Bago, Naic, Cavite, its 3,345 Amora EcoLove townhomes are equipped with solar panel systems and rainwater storage tanks, awarded 3 Stars by PHILGBC under the BERDE program.',
    'Clubhouse, Covered Basketball Court, Swimming Pool, Playground & Park, Solar-Ready System, Rainwater Harvesting',
    14.31028,
    120.76329
),
(
    4,
    1,
    5,
    'Airmen''s Village Triplex',
    'Airmen''s Village',
    'Jumbo Street, Pulang Lupa Dos',
    'Las Piñas City',
    'Metro Manila',
    'Pulang Lupa Dos, Las Piñas City',
    'Triplex',
    8900000.00,
    3,
    3,
    83.25,
    143.78,
    2,
    2,
    'Available',
    'Clean Title',
    'assets/images/AirmenTriplex.WEBP',
    'This modern, Ready-for-Occupancy (RFO) triplex townhouse offers the perfect blend of space, comfort, and accessibility. Located in a secure and peaceful community in Las Piñas, it is highly accessible to major roads, commercial hubs, schools, and airports.',
    'Clubhouse, Basketball Court, Swimming Pool, Playground & Park, 24/7 Security, Balcony',
    14.46610,
    120.99110
);

ALTER SEQUENCE properties_id_seq RESTART WITH 20;

-- ------------------------------------------------------------------------------
-- 8.4 Seed: Property Gallery Images (4 Accredited Properties)
-- ------------------------------------------------------------------------------
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary) VALUES
-- Casasuerte (ID: 1)
(1, 'assets/images/casasuerte.jpg', 'Facade & Built-in Solar', 1, TRUE),
(1, 'assets/images/casasuerte-living.jpg', 'Living Area & Inverter', 2, FALSE),
(1, 'assets/images/casasuerte-dining.jpg', 'Dining Hall', 3, FALSE),
(1, 'assets/images/casasuerte-bedroom1.jpg', 'Master Bedroom', 4, FALSE),

-- Kathleen (ID: 2)
(2, 'assets/images/kathleen-facade.jpg', 'Zen Townhouse Facade', 1, TRUE),
(2, 'assets/images/kathleen-living.jpg', 'Open Plan Living Room', 2, FALSE),
(2, 'assets/images/kathleen-dining.jpg', 'Dining & Modular Kitchen', 3, FALSE),
(2, 'assets/images/kathleen-gate.jpg', 'Included Steel Gate Entry', 4, FALSE),

-- Liora Homes (ID: 3)
(3, 'assets/images/LioraHomes.jpg', 'Liora Homes EcoLove Exterior', 1, TRUE),
(3, 'assets/images/liora-aerial.jpg', 'Aerial Solar Roof View', 2, FALSE),
(3, 'assets/images/liora-pool.jpg', 'Swimming Pool & Amenities', 3, FALSE),
(3, 'assets/images/liora-living.jpg', 'Living Room & Solar Inverter', 4, FALSE),
(3, 'assets/images/liora-dining.jpg', 'Dining Room & Kitchen', 5, FALSE),
(3, 'assets/images/liora-bedroom.jpg', 'Second Floor Bedroom', 6, FALSE),
(3, 'assets/images/liora-solar.jpg', 'Built-in Solar Panels', 7, FALSE),
(3, 'assets/images/liora-rainwater.jpg', 'Rainwater Harvesting Storage', 8, FALSE),

-- Airmen's Village Triplex (ID: 4)
(4, 'assets/images/AirmenTriplex.WEBP', 'Airmen Triplex Modern Elevation', 1, TRUE),
(4, 'assets/images/airmen-flyer.jpg', 'RFO Triplex House Elevation & Details', 2, FALSE),
(4, 'assets/images/airmen-tcp.jpg', 'Bank Financing Computation Sheet', 3, FALSE);

-- ------------------------------------------------------------------------------
-- 8.5 Seed: Property Normalized Features
-- ------------------------------------------------------------------------------
INSERT INTO property_features (property_id, feature_name) VALUES
(1, 'Gated Entrance'), (1, 'Clubhouse'), (1, 'Basketball Court'), (1, 'Parks & Playgrounds'), (1, 'Built-in Solar Power System'),
(2, 'Gated Entrance'), (2, 'Clubhouse'), (2, 'Park'), (2, 'Basketball Court'), (2, 'CCTV'), (2, 'Steel Gates Included'),
(3, 'Solar-Ready System'), (3, 'Eco-Friendly Lighting'), (3, 'Basketball Court'), (3, 'Playground & Park'), (3, 'Rainwater Harvesting'),
(4, 'Master Bedroom Balcony'), (4, 'Built-in Garage'), (4, 'Modern Kitchen Counter'), (4, 'Fiber Ready'), (4, 'Swimming Pool');

-- ------------------------------------------------------------------------------
-- 8.6 Seed: Saved Properties (Client Favorites)
-- ------------------------------------------------------------------------------
INSERT INTO saved_properties (user_id, property_id) VALUES
(2, 3), -- Client bookmarked Liora Homes
(2, 4); -- Client bookmarked Airmen Triplex

-- ------------------------------------------------------------------------------
-- 8.7 Seed: Inquiries (Connected with Foreign Keys & Codes)
-- ------------------------------------------------------------------------------
INSERT INTO inquiries (
    id, inquiry_code, client_id, property_id, assigned_agent_id,
    property_title, client_name, client_email, client_phone, message, status
) VALUES
(
    1,
    'INQ-2026-0001',
    3,
    1,
    1,
    'Casasuerte',
    'Sarah Jenkins',
    'sarah.j@gmail.com',
    '+63 917 111 2233',
    'Good day! I would like to schedule an in-person viewing this coming Saturday afternoon for Casasuerte.',
    'Under Review'
),
(
    2,
    'INQ-2026-0002',
    4,
    2,
    1,
    'Kathleen',
    'Mark Anthony Cruz',
    'mark.cruz@gmail.com',
    '+63 928 444 5566',
    'Inquiring about payment terms and bank promo financing requirements for Kathleen.',
    'Approved'
),
(
    3,
    'INQ-2026-0003',
    5,
    3,
    1,
    'Liora Homes',
    'Maria Elena Santos',
    'maria.santos@gmail.com',
    '+63 905 777 8899',
    'Interested in the reservation fee and expected turnover date for the townhouse.',
    'Completed'
);

ALTER SEQUENCE inquiries_id_seq RESTART WITH 10;

-- ------------------------------------------------------------------------------
-- 8.8 Seed: Inquiry Documents (Sample Proofs for Loan / Verification)
-- ------------------------------------------------------------------------------
INSERT INTO inquiry_documents (inquiry_id, document_type, file_name, file_url, file_size_mb, status, remarks, uploaded_at) VALUES
(2, 'government_id', 'passport_mark_cruz.pdf', 'documents/passport_mark_cruz.pdf', 2.45, 'verified', 'Valid government passport verified.', timezone('utc'::text, now())),
(2, 'proof_of_income', 'coe_payslip_3months.pdf', 'documents/coe_payslip_3months.pdf', 3.80, 'verified', 'Monthly gross income meets mortgage threshold.', timezone('utc'::text, now())),
(1, 'government_id', 'drivers_license_sarah.pdf', 'documents/drivers_license_sarah.pdf', 1.85, 'under_review', 'Awaiting secondary address verification.', timezone('utc'::text, now()));

-- ------------------------------------------------------------------------------
-- 8.9 Seed: Appointments (Viewings for Dashboard Calendar)
-- Matches sample calendar entries in dashboard.js
-- ------------------------------------------------------------------------------
INSERT INTO appointments (client_id, agent_id, property_id, client_name, client_email, client_phone, appointment_date, appointment_time, title, description, status) VALUES
(
    3, 1, 1,
    'Sarah Jenkins', 'sarah.j@gmail.com', '+63 917 111 2233',
    '2026-10-09', '10:00 AM',
    'Client viewing · Casasuerte',
    'Scheduled in-person property walkthrough with buyer and family.',
    'completed'
),
(
    5, 1, 3,
    'Maria Elena Santos', 'maria.santos@gmail.com', '+63 905 777 8899',
    '2026-10-15', '2:00 PM',
    'Client viewing · Liora Homes',
    'Model unit tour, sample computation presentation, and site reservation.',
    'confirmed'
),
(
    4, 1, 2,
    'Mark Anthony Cruz', 'mark.cruz@gmail.com', '+63 928 444 5566',
    '2026-10-22', '9:30 AM',
    'Client viewing · Kathleen',
    'Orientation and bank promo housing loan requirements submission.',
    'scheduled'
);

-- ------------------------------------------------------------------------------
-- 8.10 Seed: Testimonials (Home Page Verified Reviews)
-- ------------------------------------------------------------------------------
INSERT INTO testimonials (user_id, author_name, location, rating, quote, is_featured) VALUES
(
    3,
    'Sarah Jenkins',
    'Las Piñas City',
    5,
    'Ms. Miriam Lobren made buying our first home at Kathleen so seamless and stress-free! She guided us through every bank requirement and inspection step with great patience.',
    TRUE
),
(
    4,
    'Mark Anthony Cruz',
    'Cavite',
    5,
    'Very professional and transparent realty service. All property titles and subdivision documents were clearly explained. Highly recommended for OFWs and young families!',
    TRUE
),
(
    5,
    'Maria Elena Santos',
    'Naic, Cavite',
    5,
    'From our very first website inquiry to our house turnover at Liora Homes, Miriam Lobren provided top-notch assistance. Thank you for our family dream home!',
    TRUE
);

-- ------------------------------------------------------------------------------
-- 8.11 Seed: Notifications (Header Bell Icon)
-- ------------------------------------------------------------------------------
INSERT INTO notifications (user_id, title, message, reference_type, reference_id, is_read) VALUES
(1, 'New Property Inquiry', 'Sarah Jenkins submitted a viewing request for Casasuerte.', 'inquiry', 1, FALSE),
(1, 'Document Uploaded', 'Mark Anthony Cruz submitted Proof of Income for Kathleen.', 'inquiry', 2, FALSE),
(1, 'Appointment Reminder', 'Upcoming viewing today at 2:00 PM: Maria Elena Santos at Liora Homes.', 'appointment', 2, FALSE);
