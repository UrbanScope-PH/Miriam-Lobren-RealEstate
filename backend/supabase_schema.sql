-- ==============================================================================
-- URBANSCOPE REAL ESTATE PLATFORM - COMPLETE SUPABASE DATABASE SCHEMA & SEED
-- Lead Agent: Miriam Lobren | Platform: UrbanScope
-- Platform: UrbanScope (Las Piñas & Cavite, Philippines)
-- ==============================================================================
-- INSTRUCTIONS TO RUN ON SUPABASE:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. In the left navigation menu, click "SQL Editor" (the icon looks like >_)
-- 3. Click "+ New query"
-- 4. Paste this entire script into the query editor
-- 5. Click the green "RUN" button (or press Ctrl+Enter / Cmd+Enter)
-- 6. Check the "Results" tab at the bottom - all tables and seed records will be verified!
-- ==============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ==============================================================================
-- 1. CLEAN RESET: DROP EXISTING OBJECTS (Cascading)
-- ==============================================================================
DROP VIEW IF EXISTS view_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS view_inquiries_dashboard CASCADE;
DROP VIEW IF EXISTS view_properties_catalog CASCADE;

DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS testimonials CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS inquiry_status_history CASCADE;
DROP TABLE IF EXISTS inquiry_documents CASCADE;
DROP TABLE IF EXISTS inquiries CASCADE;
DROP TABLE IF EXISTS saved_properties CASCADE;
DROP TABLE IF EXISTS property_features CASCADE;
DROP TABLE IF EXISTS property_images CASCADE;
DROP TABLE IF EXISTS properties CASCADE;
DROP TABLE IF EXISTS property_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop obsolete helper functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS sync_property_type_name() CASCADE;
DROP FUNCTION IF EXISTS sync_property_primary_image() CASCADE;
DROP FUNCTION IF EXISTS handle_new_inquiry() CASCADE;

-- ==============================================================================
-- 2. CREATE HELPER FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keep properties.property_type (text) in sync with property_types.name (FK)
CREATE OR REPLACE FUNCTION sync_property_type_name()
RETURNS TRIGGER AS $$
DECLARE
    found_name TEXT;
    found_id BIGINT;
BEGIN
    IF NEW.property_type_id IS NOT NULL THEN
        SELECT name INTO found_name FROM property_types WHERE id = NEW.property_type_id;
        IF found_name IS NOT NULL THEN
            NEW.property_type := found_name;
        END IF;
    ELSIF NEW.property_type IS NOT NULL AND NEW.property_type <> '' THEN
        SELECT id INTO found_id FROM property_types WHERE LOWER(name) = LOWER(NEW.property_type) OR LOWER(slug) = LOWER(NEW.property_type);
        IF found_id IS NOT NULL THEN
            NEW.property_type_id := found_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- When a property image is designated as primary, sync to properties.image_url
CREATE OR REPLACE FUNCTION sync_property_primary_image()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_primary = TRUE THEN
        -- Unset any other primary images for this property
        UPDATE property_images
        SET is_primary = FALSE
        WHERE property_id = NEW.property_id AND id <> NEW.id;

        -- Update parent property table
        UPDATE properties
        SET image_url = NEW.image_url
        WHERE id = NEW.property_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-assign inquiry code and create initial status history entry
CREATE OR REPLACE FUNCTION handle_new_inquiry()
RETURNS TRIGGER AS $$
DECLARE
    seq_num TEXT;
BEGIN
    -- Auto-generate inquiry code if not specified
    IF NEW.inquiry_code IS NULL OR NEW.inquiry_code = '' THEN
        seq_num := LPAD(NEW.id::text, 4, '0');
        NEW.inquiry_code := 'INQ-' || TO_CHAR(timezone('utc'::text, now()), 'YYYY') || '-' || seq_num;
        UPDATE inquiries SET inquiry_code = NEW.inquiry_code WHERE id = NEW.id;
    END IF;

    -- Record initial status in history table
    INSERT INTO inquiry_status_history (inquiry_id, status, description, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.status, 'Submitted'),
        'Inquiry received and registered in the system.',
        timezone('utc'::text, now())
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==============================================================================
-- 3. CREATE NORMALIZED TABLES
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Table 1: users
-- Platform users, clients, licensed real estate agents, and system administrators
-- ------------------------------------------------------------------------------
CREATE TABLE users (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'agent', 'admin', 'user')),
    license_number TEXT,
    avatar_url TEXT DEFAULT 'assets/images/agent.jpg',
    google_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 2: property_types
-- Lookup table for standardized real estate property classifications
-- ------------------------------------------------------------------------------
CREATE TABLE property_types (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 3: properties
-- Master listing catalog: architectural specifications, pricing, and locations
-- ------------------------------------------------------------------------------
CREATE TABLE properties (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    property_type_id BIGINT REFERENCES property_types(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    subdivision_name TEXT,
    address TEXT,
    city TEXT NOT NULL,
    province TEXT NOT NULL DEFAULT 'Cavite',
    location TEXT NOT NULL,
    property_type TEXT NOT NULL,
    price NUMERIC(15, 2) NOT NULL CHECK (price >= 0),
    bedrooms INTEGER DEFAULT 3 CHECK (bedrooms >= 0),
    bathrooms INTEGER DEFAULT 2 CHECK (bathrooms >= 0),
    lot_area NUMERIC(10, 2) DEFAULT 120.00 CHECK (lot_area >= 0),
    floor_area NUMERIC(10, 2) DEFAULT 80.00 CHECK (floor_area >= 0),
    carports INTEGER DEFAULT 1 CHECK (carports >= 0),
    storeys INTEGER DEFAULT 2 CHECK (storeys >= 1),
    status TEXT DEFAULT 'Available' CHECK (status IN ('Available', 'Reserved', 'Sold', 'Under Review')),
    title_status TEXT DEFAULT 'Clean Title',
    utilities TEXT DEFAULT 'Meralco Electric, Maynilad/Deep Well Water, Fiber Ready',
    image_url TEXT,
    description TEXT,
    amenities TEXT DEFAULT '',
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 4: property_images
-- High-resolution gallery photos and carousel slides for individual listings
-- ------------------------------------------------------------------------------
CREATE TABLE property_images (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    display_order INTEGER DEFAULT 1,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 5: property_features
-- Normalized amenities and architectural attributes (1:N relation)
-- ------------------------------------------------------------------------------
CREATE TABLE property_features (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    feature_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 6: saved_properties
-- Client favorites / bookmarks for user profiles and quick reference
-- ------------------------------------------------------------------------------
CREATE TABLE saved_properties (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    saved_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_user_saved_property UNIQUE (user_id, property_id)
);

-- ------------------------------------------------------------------------------
-- Table 7: inquiries
-- Client consultation requests, payment inquiries, and reservation applications
-- ------------------------------------------------------------------------------
CREATE TABLE inquiries (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    inquiry_code TEXT UNIQUE,
    client_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL,
    assigned_agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    property_title TEXT NOT NULL DEFAULT 'General Inquiry',
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT DEFAULT '',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Under Review' CHECK (
        status IN (
            'Submitted',
            'Requirements Submitted',
            'Under Review',
            'For Resubmission',
            'Approved',
            'Completed',
            'Cancelled'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 8: inquiry_documents
-- Client requirements and ID verification documents for loan processing
-- ------------------------------------------------------------------------------
CREATE TABLE inquiry_documents (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('government_id', 'proof_of_income', 'tin_proof', 'billing_proof', 'other')),
    file_name TEXT,
    file_url TEXT,
    file_size_mb NUMERIC(4, 2) CHECK (file_size_mb <= 15.00),
    status TEXT DEFAULT 'not_uploaded' CHECK (status IN ('not_uploaded', 'submitted', 'under_review', 'verified', 'rejected')),
    remarks TEXT,
    uploaded_at TIMESTAMPTZ
);

-- ------------------------------------------------------------------------------
-- Table 9: inquiry_status_history
-- Full audit trail of workflow progression for client inquiries
-- ------------------------------------------------------------------------------
CREATE TABLE inquiry_status_history (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    inquiry_id BIGINT NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    changed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 10: appointments
-- Scheduled property viewings and client consultation bookings (Calendar View)
-- ------------------------------------------------------------------------------
CREATE TABLE appointments (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    client_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    agent_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT DEFAULT '',
    appointment_date DATE NOT NULL,
    appointment_time TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 11: testimonials
-- Verified client feedback, ratings, and recommendations (Home Page Showcase)
-- ------------------------------------------------------------------------------
CREATE TABLE testimonials (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    location TEXT DEFAULT 'Cavite, Philippines',
    rating INTEGER DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    quote TEXT NOT NULL,
    is_featured BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- Table 12: notifications
-- Notification alerts for clients and admins (header bell dropdown)
-- ------------------------------------------------------------------------------
CREATE TABLE notifications (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_type TEXT,
    reference_id BIGINT,
    is_read BOOLEAN DEFAULT FALSE,
    is_seen BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==============================================================================
-- 4. ATTACH DATABASE TRIGGERS
-- ==============================================================================

-- Updated at triggers
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_inquiries_updated_at
    BEFORE UPDATE ON inquiries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Property type synchronization trigger
CREATE TRIGGER trg_properties_sync_type
    BEFORE INSERT OR UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION sync_property_type_name();

-- Primary image synchronization trigger
CREATE TRIGGER trg_property_images_primary
    AFTER INSERT OR UPDATE ON property_images
    FOR EACH ROW EXECUTE FUNCTION sync_property_primary_image();

-- Inquiry creation workflow trigger
CREATE TRIGGER trg_inquiries_after_insert
    AFTER INSERT ON inquiries
    FOR EACH ROW EXECUTE FUNCTION handle_new_inquiry();


-- ==============================================================================
-- 5. PERFORMANCE & SEARCH INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(city, province);
CREATE INDEX IF NOT EXISTS idx_properties_type_id ON properties(property_type_id);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_specs ON properties(bedrooms, bathrooms);
CREATE INDEX IF NOT EXISTS idx_properties_agent ON properties(agent_id);

CREATE INDEX IF NOT EXISTS idx_property_images_property ON property_images(property_id, display_order);
CREATE INDEX IF NOT EXISTS idx_property_features_property ON property_features(property_id);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_client ON inquiries(client_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_agent ON inquiries(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);


-- ==============================================================================
-- 6. RELATIONAL VIEWS (Convenience for API & Dashboard)
-- ==============================================================================

-- Complete property catalog with primary photo and agent details
CREATE OR REPLACE VIEW view_properties_catalog AS
SELECT
    p.id,
    p.title,
    p.subdivision_name,
    p.address,
    p.city,
    p.province,
    p.location,
    pt.name AS property_type,
    pt.slug AS property_type_slug,
    p.price,
    p.bedrooms,
    p.bathrooms,
    p.lot_area,
    p.floor_area,
    p.carports,
    p.storeys,
    p.status,
    p.title_status,
    p.utilities,
    p.image_url,
    p.description,
    p.amenities,
    p.latitude,
    p.longitude,
    p.created_at,
    u.full_name AS agent_name,
    u.phone AS agent_phone,
    u.email AS agent_email
FROM properties p
LEFT JOIN property_types pt ON p.property_type_id = pt.id
LEFT JOIN users u ON p.agent_id = u.id;

-- Inquiries joined with property title, client details, and agent
CREATE OR REPLACE VIEW view_inquiries_dashboard AS
SELECT
    i.id,
    i.inquiry_code,
    i.property_id,
    COALESCE(p.title, i.property_title) AS property_title,
    p.location AS property_location,
    p.price AS property_price,
    i.client_id,
    i.client_name,
    i.client_email,
    i.client_phone,
    i.message,
    i.status,
    i.created_at,
    i.updated_at,
    u_agent.full_name AS assigned_agent_name
FROM inquiries i
LEFT JOIN properties p ON i.property_id = p.id
LEFT JOIN users u_agent ON i.assigned_agent_id = u_agent.id;

-- High-level KPI summary cards for the Admin Dashboard
CREATE OR REPLACE VIEW view_dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM properties) AS total_properties,
    (SELECT COUNT(*) FROM users WHERE role IN ('client', 'user')) AS total_clients,
    (SELECT COUNT(*) FROM inquiries) AS total_inquiries,
    (SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%review%' OR LOWER(status) LIKE '%pending%') AS pending_inquiries,
    (SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%completed%') AS completed_inquiries,
    (SELECT COUNT(*) FROM inquiries WHERE LOWER(status) LIKE '%approved%') AS approved_inquiries;


-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Property Types & Catalog: Public read access
CREATE POLICY "Public can view property types" ON property_types FOR SELECT USING (true);
CREATE POLICY "Public can view properties" ON properties FOR SELECT USING (true);
CREATE POLICY "Public can view property images" ON property_images FOR SELECT USING (true);
CREATE POLICY "Public can view property features" ON property_features FOR SELECT USING (true);
CREATE POLICY "Public can view testimonials" ON testimonials FOR SELECT USING (true);

-- Allow backend / admin full access to properties catalog
CREATE POLICY "Allow insert properties" ON properties FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update properties" ON properties FOR UPDATE USING (true);
CREATE POLICY "Allow delete properties" ON properties FOR DELETE USING (true);

CREATE POLICY "Allow insert property images" ON property_images FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update property images" ON property_images FOR UPDATE USING (true);
CREATE POLICY "Allow delete property images" ON property_images FOR DELETE USING (true);

CREATE POLICY "Allow insert property features" ON property_features FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow delete property features" ON property_features FOR DELETE USING (true);

-- Inquiries: Visitors and clients can submit inquiries; admins can read & manage
CREATE POLICY "Public can submit inquiries" ON inquiries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow read inquiries" ON inquiries FOR SELECT USING (true);
CREATE POLICY "Allow update inquiries" ON inquiries FOR UPDATE USING (true);
CREATE POLICY "Allow delete inquiries" ON inquiries FOR DELETE USING (true);

CREATE POLICY "Allow manage inquiry documents" ON inquiry_documents FOR ALL USING (true);
CREATE POLICY "Allow manage inquiry status history" ON inquiry_status_history FOR ALL USING (true);

-- Appointments: Public can book consultations; admins can view and manage
CREATE POLICY "Public can book appointments" ON appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow read appointments" ON appointments FOR SELECT USING (true);
CREATE POLICY "Allow update appointments" ON appointments FOR UPDATE USING (true);
CREATE POLICY "Allow delete appointments" ON appointments FOR DELETE USING (true);

-- Users: Authentication, profile lookup, sign up, and superadmin account management
CREATE POLICY "Allow read users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow insert users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow delete users" ON users FOR DELETE USING (true);

-- Saved Properties & Notifications
CREATE POLICY "Allow manage saved properties" ON saved_properties FOR ALL USING (true);
CREATE POLICY "Allow manage notifications" ON notifications FOR ALL USING (true);


-- ==============================================================================
-- 8. COMPREHENSIVE SEED DATA
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
    11,
    'urbanscope.cvsu@gmail.com',
    'urbanscope2026',
    'UrbanScope Admin',
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


-- ==============================================================================
-- 9. VERIFICATION & SUMMARY CHECK
-- Run to confirm all 12 tables and views are populated
-- ==============================================================================
SELECT '1. users' AS table_name, COUNT(*)::text AS row_count FROM users
UNION ALL
SELECT '2. property_types', COUNT(*)::text FROM property_types
UNION ALL
SELECT '3. properties', COUNT(*)::text FROM properties
UNION ALL
SELECT '4. property_images', COUNT(*)::text FROM property_images
UNION ALL
SELECT '5. property_features', COUNT(*)::text FROM property_features
UNION ALL
SELECT '6. saved_properties', COUNT(*)::text FROM saved_properties
UNION ALL
SELECT '7. inquiries', COUNT(*)::text FROM inquiries
UNION ALL
SELECT '8. inquiry_documents', COUNT(*)::text FROM inquiry_documents
UNION ALL
SELECT '9. inquiry_status_history', COUNT(*)::text FROM inquiry_status_history
UNION ALL
SELECT '10. appointments', COUNT(*)::text FROM appointments
UNION ALL
SELECT '11. testimonials', COUNT(*)::text FROM testimonials
UNION ALL
SELECT '12. notifications', COUNT(*)::text FROM notifications;
