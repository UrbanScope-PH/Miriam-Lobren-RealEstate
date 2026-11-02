-- ==============================================================================
-- URBANSCOPE - MIGRATION 0007: NORMALIZE LEAD ADMIN ROLE AND EMAIL
-- Brokerage: UrbanScope | Lead Agent: Miriam Lobren (miriam@gmail.com)
-- ==============================================================================
-- 1. Ensure superadmin account urbanscope.cvsu@gmail.com has role 'superadmin'
-- 2. Ensure lead admin account miriam@gmail.com has role 'admin' with latest phone
-- 3. Demote legacy duplicate admin row miriamlobren@gmail.com to 'client'
-- 4. Re-assign property agent_id from legacy id 1 to active admin id 15
-- ==============================================================================

UPDATE users
SET role = 'superadmin'
WHERE LOWER(email) = 'urbanscope.cvsu@gmail.com';

UPDATE users
SET role = 'admin',
    full_name = 'Miriam Lobren',
    phone = '09123456789',
    title = 'Real Estate Agent',
    brokerage = 'UrbanScope',
    license_number = 'PRC REB #0031892'
WHERE LOWER(email) = 'miriam@gmail.com';

UPDATE users
SET role = 'client'
WHERE LOWER(email) = 'miriamlobren@gmail.com' AND id = 1;

UPDATE properties
SET agent_id = 15
WHERE agent_id = 1;
