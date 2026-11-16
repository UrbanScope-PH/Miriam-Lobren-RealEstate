-- ==============================================================================
-- Migration: Rename Kathleen -> Kathleen - Place 5, remove RFO wording for
--            Benecia & Amore Classico, and replace accredited gallery images
--            with the ordered PROPERTIES/ photo sequences (Airmen 1 photo only).
-- ==============================================================================

-- 1. Rename Kathleen to Kathleen - Place 5
UPDATE properties
SET title = 'Kathleen - Place 5',
    property_name = 'Kathleen - Place 5',
    description = REPLACE(COALESCE(description, ''), 'Kathleen is a secure', 'Kathleen - Place 5 is a secure'),
    updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%kathleen%'
  AND title <> 'Kathleen - Place 5';

-- 2. Remove RFO labels/wording from Benecia Single-Attached and Amore Classico
UPDATE properties
SET amenities = 'Single-Attached House Design, Private Carport, Front Fence and Gate, Balcony, Lanai, Maid''s Room, Powder Room',
    updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%benecia%';

UPDATE properties
SET description = 'Amore Classico by Benedetto Residences is a thoughtfully designed three-storey townhouse in Barangay Pulang Lupa Uno, Las Piñas City.',
    amenities = 'Three-Storey Townhouse Design, Spacious Family Hall, Dedicated Maid''s Room, Private Patio, Powder Room',
    updated_at = timezone('utc'::text, now())
WHERE LOWER(title) LIKE '%amore%';

-- 3. Replace gallery images cleanly for Properties 1-6 from ordered PROPERTIES/ sets
DELETE FROM property_images
WHERE property_id IN (
    SELECT id FROM properties
    WHERE LOWER(title) LIKE '%suerte%'
       OR LOWER(title) LIKE '%kathleen%'
       OR LOWER(title) LIKE '%liora%'
       OR LOWER(title) LIKE '%airmen%'
       OR LOWER(title) LIKE '%benecia%'
       OR LOWER(title) LIKE '%amore%'
);

-- Casasuerte (8 photos)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%suerte%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM prop
CROSS JOIN (
    VALUES
        ('assets/images/casasuerte.jpg', 'Facade & Built-in Solar', 1, TRUE),
        ('assets/images/casasuerte-living.jpg', 'Living Area & Inverter', 2, FALSE),
        ('assets/images/casasuerte-dining.jpg', 'Dining Hall', 3, FALSE),
        ('assets/images/casasuerte-bedroom1.jpg', 'Master Bedroom', 4, FALSE),
        ('assets/images/casasuerte-bedroom2.jpg', 'Second Bedroom', 5, FALSE),
        ('assets/images/casasuerte-bathroom.jpg', 'Modern Bathroom', 6, FALSE),
        ('assets/images/casasuerte-hallway.jpg', 'Second Floor Hallway & Staircase', 7, FALSE),
        ('assets/images/casasuerte-service.jpg', 'Service & Laundry Area', 8, FALSE)
) AS v(image_url, caption, display_order, is_primary);

-- Kathleen - Place 5 (10 photos in sequence)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%kathleen%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM prop
CROSS JOIN (
    VALUES
        ('assets/images/kathleen-facade.jpg', 'Kathleen - Place 5 Exterior Facade', 1, TRUE),
        ('assets/images/kathleen-1.jpg', 'Steel Gate & Exterior Frontage', 2, FALSE),
        ('assets/images/kathleen-2.jpg', 'Dressed-Up Living & Dining Room', 3, FALSE),
        ('assets/images/kathleen-3.jpg', 'Dining Room, Kitchen & Staircase', 4, FALSE),
        ('assets/images/kathleen-4.jpg', 'Living Room Seating & Windows', 5, FALSE),
        ('assets/images/kathleen-5.jpg', 'Second Floor Hallway & Staircase', 6, FALSE),
        ('assets/images/kathleen-6.jpg', 'Bedroom with Modular Cabinets', 7, FALSE),
        ('assets/images/kathleen-7.jpg', 'Ground Floor Living, Dining & Kitchen', 8, FALSE),
        ('assets/images/kathleen-8.jpg', 'Covered Carport & Driveway', 9, FALSE),
        ('assets/images/kathleen-9.jpg', 'Open Ground Floor Plan', 10, FALSE)
) AS v(image_url, caption, display_order, is_primary);

-- Liora Homes (12 photos in sequence)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%liora%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM prop
CROSS JOIN (
    VALUES
        ('assets/images/LioraHomes.jpg', 'Liora Homes EcoLove Exterior', 1, TRUE),
        ('assets/images/liora-2.jpg', 'Street Perspective', 2, FALSE),
        ('assets/images/liora-3.jpg', 'Second Floor Bedroom', 3, FALSE),
        ('assets/images/liora-4.jpg', 'Dining & Kitchen Area', 4, FALSE),
        ('assets/images/liora-5.jpg', 'Living Room with Solar Inverter', 5, FALSE),
        ('assets/images/liora-6.jpg', 'Modern Stairs with Modular Storage', 6, FALSE),
        ('assets/images/liora-7.jpg', 'Open Concept Interior Space', 7, FALSE),
        ('assets/images/liora-8.jpg', 'Eco-Friendly Community', 8, FALSE),
        ('assets/images/liora-9.jpg', 'Swimming Pool & Clubhouse', 9, FALSE),
        ('assets/images/liora-10.jpg', 'Aerial Solar Roof Townhouses', 10, FALSE),
        ('assets/images/liora-11.jpg', 'Built-in Solar Panels', 11, FALSE),
        ('assets/images/liora-12.jpg', 'Rainwater Harvesting Storage', 12, FALSE)
) AS v(image_url, caption, display_order, is_primary);

-- Airmen's Village Triplex (1 photo only)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%airmen%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, 'assets/images/AirmenTriplex.WEBP', 'Airmen Triplex Modern Elevation', 1, TRUE
FROM prop;

-- Benecia Single-Attached (14 photos)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%benecia%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM prop
CROSS JOIN (
    VALUES
        ('assets/images/benecia-facade.jpg', 'Benecia Single-Attached Facade', 1, TRUE),
        ('assets/images/benecia-1.jpg', 'Living Area', 2, FALSE),
        ('assets/images/benecia-2.jpg', 'Kitchen Area', 3, FALSE),
        ('assets/images/benecia-3.jpg', 'Lanai Area', 4, FALSE),
        ('assets/images/benecia-4.jpg', 'Service Area', 5, FALSE),
        ('assets/images/benecia-5.jpg', 'Maid''s Room', 6, FALSE),
        ('assets/images/benecia-6.jpg', 'Ground Floor Toilet & Bath', 7, FALSE),
        ('assets/images/benecia-7.jpg', 'Second Floor Hallway', 8, FALSE),
        ('assets/images/benecia-8.jpg', 'Master''s Bedroom', 9, FALSE),
        ('assets/images/benecia-9.jpg', 'Master''s Bedroom with Built-In Cabinets', 10, FALSE),
        ('assets/images/benecia-10.jpg', 'Master Bedroom Toilet & Bath', 11, FALSE),
        ('assets/images/benecia-11.jpg', 'Balcony', 12, FALSE),
        ('assets/images/benecia-12.jpg', 'Bedroom 2', 13, FALSE),
        ('assets/images/benecia-13.jpg', 'Bedroom 3', 14, FALSE)
) AS v(image_url, caption, display_order, is_primary);

-- Amore Classico (13 photos)
WITH prop AS (SELECT id FROM properties WHERE LOWER(title) LIKE '%amore%' ORDER BY id ASC LIMIT 1)
INSERT INTO property_images (property_id, image_url, caption, display_order, is_primary)
SELECT prop.id, v.image_url, v.caption, v.display_order, v.is_primary
FROM prop
CROSS JOIN (
    VALUES
        ('assets/images/amore-facade.jpg', 'Amore Classico Exterior', 1, TRUE),
        ('assets/images/amore-livingarea.jpg', 'Living Area', 2, FALSE),
        ('assets/images/amore-dining.jpg', 'Dining Area', 3, FALSE),
        ('assets/images/amore-kitchen.jpg', 'Kitchen Area', 4, FALSE),
        ('assets/images/amore-carport.jpg', 'Covered Carport', 5, FALSE),
        ('assets/images/amore-servicearea.jpg', 'Service Area', 6, FALSE),
        ('assets/images/amore-famcorner.jpg', '2nd Floor Family Corner', 7, FALSE),
        ('assets/images/amore-masterbedroom.jpg', 'Master Bedroom', 8, FALSE),
        ('assets/images/amore-mrbath.jpg', 'Master Bedroom Bath', 9, FALSE),
        ('assets/images/amore-bedroom1.jpg', 'Bedroom 1', 10, FALSE),
        ('assets/images/amore-bedroom2.jpg', 'Bedroom 2', 11, FALSE),
        ('assets/images/amore-3rdfloortoilet.jpg', '3rd Floor Toilet & Bath', 12, FALSE),
        ('assets/images/amore-laundrydeck.jpg', 'Laundry Deck', 13, FALSE)
) AS v(image_url, caption, display_order, is_primary);

