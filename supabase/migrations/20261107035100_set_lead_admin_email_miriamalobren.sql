-- ==============================================================================
-- URBANSCOPE - MIGRATION 0011: SET LEAD ADMIN EMAIL TO MIRIAMALOBREN@GMAIL.COM
-- Brokerage: CDMiranda Realty / UrbanScope | Lead Agent: Miriam Lobren (miriamalobren@gmail.com)
-- ==============================================================================
-- 1. Ensure lead admin account miriamalobren@gmail.com has role 'admin'
-- 2. Populate full profile credentials (title, brokerage, phone, license)
-- 3. Re-assign property agent_id to active admin id 17
-- ==============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE LOWER(email) = 'miriamalobren@gmail.com') THEN
        UPDATE users
        SET role = 'admin',
            full_name = 'Miriam Lobren',
            phone = '+63 918 964 5434',
            title = 'Real Estate Sales Person',
            brokerage = 'CDMiranda Realty',
            license_number = 'PRC REB #402',
            avatar_url = 'assets/images/agent.jpg',
            updated_at = timezone('utc'::text, now())
        WHERE LOWER(email) = 'miriamalobren@gmail.com';
    ELSE
        INSERT INTO users (
            email, password_hash, full_name, phone, role,
            license_number, avatar_url, title, brokerage, bio, created_at, updated_at
        ) VALUES (
            'miriamalobren@gmail.com',
            '44642fa6779150106462e64ac546bbd4$8702f1df11fd794ec0394fb4d7339b0f5e86a37652e80dabf6aa21c40351b20c',
            'Miriam Lobren',
            '+63 918 964 5434',
            'admin',
            'PRC REB #402',
            'assets/images/agent.jpg',
            'Real Estate Sales Person',
            'CDMiranda Realty',
            'Hello! I''m Miriam Lobren, a real estate sales person with CDMiranda Realty, with over 10 years of expertise in the industry.',
            timezone('utc'::text, now()),
            timezone('utc'::text, now())
        );
    END IF;
END $$;

UPDATE properties
SET agent_id = (SELECT id FROM users WHERE LOWER(email) = 'miriamalobren@gmail.com' LIMIT 1)
WHERE agent_id IS NULL OR agent_id IN (1, 15);

