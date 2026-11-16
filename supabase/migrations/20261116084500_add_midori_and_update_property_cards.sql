-- Migration: Add Midori Mid-Rise Condo – Zone 1, ensure Benecia & Amore Classico,
--            sync updated property card facade image paths, and remove deprecated TCP computation flyer.
-- Idempotent: Safe to run multiple times against existing or freshly seeded databases.

-- 1. Ensure property types exist cleanly
INSERT INTO property_types (name, slug, description)
SELECT 'Condominium', 'condominium', 'Mid to high-rise residential buildings with shared amenities and security'
WHERE NOT EXISTS (SELECT 1 FROM property_types WHERE LOWER(slug) = 'condominium');

INSERT INTO property_types (name, slug, description)
SELECT 'Single Attached', 'single-attached', 'Independent house with one boundary wall built against the property line'
WHERE NOT EXISTS (SELECT 1 FROM property_types WHERE LOWER(slug) = 'single-attached');

INSERT INTO property_types (name, slug, description)
SELECT 'Townhouse', 'townhouse', 'Multi-floor modern residences sharing common side walls'
WHERE NOT EXISTS (SELECT 1 FROM property_types WHERE LOWER(slug) = 'townhouse');

-- 2. Keep canonical card image paths aligned across existing properties
UPDATE properties
SET image_url = 'assets/images/kathleen-facade.jpg', updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%kathleen%'
  AND (image_url IS NULL OR image_url = '' OR image_url LIKE 'assets/images/kathleen%');

UPDATE properties
SET image_url = 'assets/images/benecia-facade.jpg', updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%benecia%'
  AND (image_url IS NULL OR image_url = '' OR image_url LIKE 'assets/images/benecia%');

UPDATE properties
SET image_url = 'assets/images/amore-facade.jpg', updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%amore%'
  AND (image_url IS NULL OR image_url = '' OR image_url LIKE 'assets/images/amore%');

-- 3. Ensure Benecia Single-Attached exists if database started from the original 4-property seed
INSERT INTO properties (
    agent_id, property_type_id, title, subdivision_name,
    address, city, province, location, property_type,
    price, bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
    status, title_status, image_url, description, amenities, latitude, longitude
)
SELECT
    (SELECT id FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id ASC LIMIT 1),
    (SELECT id FROM property_types WHERE LOWER(slug) = 'single-attached' ORDER BY id ASC LIMIT 1),
    'Benecia Single-Attached',
    'Sihanouk Village',
    'Sihanouk Village, Talon IV',
    'Las Piñas City',
    'Metro Manila',
    'Sihanouk Village, Barangay Talon IV, Las Piñas City',
    'Single-Attached House',
    9695000.00,
    3,
    3,
    102.00,
    117.00,
    1,
    2,
    'Available',
    'Clean Title',
    'assets/images/benecia-facade.jpg',
    'Benecia Single Attached offers a modern and spacious home designed for families looking for comfort, privacy, and functionality in Sihanouk Village, Talon IV, Las Piñas City. Complete turnover with front fence and gate.',
    'Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Maid''s Room, Powder Room, RFO Ready',
    14.43750,
    120.99950
WHERE NOT EXISTS (
    SELECT 1 FROM properties WHERE LOWER(title) LIKE '%benecia%'
);

-- 4. Ensure Amore Classico exists if database started from the original 4-property seed
INSERT INTO properties (
    agent_id, property_type_id, title, subdivision_name,
    address, city, province, location, property_type,
    price, bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
    status, title_status, image_url, description, amenities, latitude, longitude
)
SELECT
    (SELECT id FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id ASC LIMIT 1),
    (SELECT id FROM property_types WHERE LOWER(slug) = 'townhouse' ORDER BY id ASC LIMIT 1),
    'Amore Classico',
    'Benedetto Residences',
    'Benedetto Residences, Pulang Lupa Uno',
    'Las Piñas City',
    'Metro Manila',
    'Benedetto Residences, Barangay Pulang Lupa Uno, Las Piñas City',
    'Townhouse',
    7995000.00,
    3,
    3,
    52.00,
    102.00,
    1,
    3,
    'Available',
    'Clean Title',
    'assets/images/amore-facade.jpg',
    'Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse in Barangay Pulang Lupa Uno, Las Piñas City. Ready for Occupancy (RFO).',
    'Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid''s Room, Private Patio, Powder Room, RFO Ready',
    14.47880,
    120.98560
WHERE NOT EXISTS (
    SELECT 1 FROM properties WHERE LOWER(title) LIKE '%amore%'
);

-- 5. Insert Midori Mid-Rise Condo – Zone 1
INSERT INTO properties (
    agent_id, property_type_id, title, subdivision_name,
    address, city, province, location, property_type,
    price, bedrooms, bathrooms, lot_area, floor_area, carports, storeys,
    status, title_status, image_url, description, amenities, latitude, longitude
)
SELECT
    (SELECT id FROM users WHERE role IN ('admin', 'superadmin') ORDER BY id ASC LIMIT 1),
    (SELECT id FROM property_types WHERE LOWER(slug) = 'condominium' ORDER BY id ASC LIMIT 1),
    'Midori Mid-Rise Condo – Zone 1',
    'Midori Zone 1',
    'Zone 1, Buildings 14–21',
    'Dasmariñas City',
    'Cavite',
    'Zone 1, Buildings 14–21, Dasmariñas, Cavite',
    'Mid-Rise Condominium',
    3140000.00,
    2,
    1,
    0.00,
    50.00,
    0,
    2,
    'Available',
    'Clean Title',
    'assets/images/midori-main.webp',
    'Midori Mid-Rise Condo – Zone 1 offers a convenient and comfortable living experience for young professionals, couples, and starting families looking for an affordable home in Dasmariñas, Cavite. Each 50 sqm unit features two bedrooms, a toilet and bath, a living area, a dining and kitchen area, and a patio, with Inner and End unit options.',
    '2nd Floor Units, Inner & End Unit Types, Living Area, Dining Area, Kitchen Area, Patio, Convenient Access to Public Transportation, Near Dasmariñas Bayan, Close to Schools and Essential Establishments, Accessible to Daily Needs',
    14.32940,
    120.93670
WHERE NOT EXISTS (
    SELECT 1 FROM properties WHERE LOWER(title) LIKE '%midori%'
);

-- 6. Remove deprecated TCP Sample Computation gallery entries
DELETE FROM property_images
WHERE LOWER(image_url) LIKE '%-tcp.jpg%'
   OR LOWER(image_url) LIKE '%benecia-flyer.jpg%'
   OR LOWER(image_url) LIKE '%amore-flyer.jpg%';

-- 7. Seed Midori gallery images idempotently
WITH midori AS (
    SELECT id FROM properties WHERE LOWER(title) LIKE '%midori%' ORDER BY id ASC LIMIT 1
)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT m.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM midori m
CROSS JOIN (
    VALUES
        ('assets/images/midori-main.webp', 'Midori Mid-Rise Building Exterior', 1, TRUE),
        ('assets/images/midori-living.jpg', 'Living & Dining Area', 2, FALSE),
        ('assets/images/midori-kitchen.jpg', 'Kitchen Area', 3, FALSE),
        ('assets/images/midori-bedroom1.jpg', 'Bedroom 1', 4, FALSE),
        ('assets/images/midori-bedroom2.jpg', 'Bedroom 2', 5, FALSE),
        ('assets/images/midori-toilet.jpg', 'Toilet & Bath', 6, FALSE),
        ('assets/images/midori-patio.jpg', 'Patio Area', 7, FALSE)
) AS v(image_url, caption, display_order, is_primary)
WHERE NOT EXISTS (
    SELECT 1 FROM property_images pi
    WHERE pi.property_id = m.id AND pi.image_url = v.image_url
);

-- 8. Seed Midori features idempotently
WITH midori AS (
    SELECT id FROM properties WHERE LOWER(title) LIKE '%midori%' ORDER BY id ASC LIMIT 1
)
INSERT INTO property_features (property_id, feature_name)
SELECT m.id, f.feature_name
FROM midori m
CROSS JOIN (
    VALUES
        ('2nd Floor Units'),
        ('Inner & End Unit Types'),
        ('Private Patio'),
        ('Near Dasmariñas Bayan'),
        ('Convenient Public Transport')
) AS f(feature_name)
WHERE NOT EXISTS (
    SELECT 1 FROM property_features pf
    WHERE pf.property_id = m.id AND pf.feature_name = f.feature_name
);

SELECT setval(
    pg_get_serial_sequence('properties', 'id'),
    GREATEST((SELECT COALESCE(MAX(id), 1) FROM properties), 20)
);
