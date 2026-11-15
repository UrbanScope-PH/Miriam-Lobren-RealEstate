"""
UrbanScope - Pydantic Request & Response Data Models
Validates incoming payloads, enforces length/value bounds, sanitizes image URLs,
and structures trimmed API responses.
"""

from typing import Optional
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field, field_validator

from backend.security import sanitize_image_url


# ==========================================================
# AUTH SCHEMAS
# ==========================================================

class _BotProtectedMixin(BaseModel):
    company_website: Optional[str] = Field(default=None, max_length=256)
    website: Optional[str] = Field(default=None, max_length=256)
    hp: Optional[str] = Field(default=None, alias="_hp", max_length=256)
    ft: Optional[float] = Field(default=None, alias="_ft")
    form_rendered_ms: Optional[float] = Field(default=None)
    turnstile_token: Optional[str] = Field(default=None, max_length=4096)

    model_config = {"populate_by_name": True}


class UserRegister(_BotProtectedMixin):
    email: str = Field(..., min_length=3, max_length=254, description="User email address")
    password: str = Field(..., min_length=8, max_length=128, description="User password (minimum 8 characters)")
    full_name: str = Field(..., min_length=2, max_length=120, description="Full legal or preferred name")
    phone: Optional[str] = Field(default="", max_length=40, description="Contact phone number")


class EmailOtpStartRequest(_BotProtectedMixin):
    email: str = Field(..., min_length=3, max_length=254, description="Email address to verify")


class EmailOtpRegistrationComplete(_BotProtectedMixin):
    email: str = Field(..., min_length=3, max_length=254)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^[0-9]{6}$")
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=120)
    phone: Optional[str] = Field(default="", max_length=40)


class OtpCodeCheckRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254, description="Email address being verified")
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^[0-9]{6}$", description="6-digit verification code")
    purpose: Optional[str] = Field(default="register", max_length=32, description="OTP challenge purpose ('register' or 'password_reset')")


class PasswordResetRequest(_BotProtectedMixin):
    email: str = Field(..., min_length=3, max_length=254)


class PasswordResetComplete(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^[0-9]{6}$")
    password: str = Field(..., min_length=8, max_length=128)


class UserLogin(_BotProtectedMixin):
    email: str = Field(..., min_length=3, max_length=254, description="Registered email address")
    password: str = Field(..., min_length=1, max_length=128, description="Account password")


class GoogleAuthRequest(BaseModel):
    credential: Optional[str] = Field(default=None, max_length=8192, description="Google OAuth2 ID token (JWT)")
    access_token: Optional[str] = Field(default=None, max_length=4096, description="Google OAuth2 access token")


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = ""
    role: str = "user"
    avatar_url: Optional[str] = "assets/images/agent.jpg"
    license_number: Optional[str] = ""
    title: Optional[str] = "Real Estate Salesperson"
    brokerage: Optional[str] = "CD Miranda Realty"
    bio: Optional[str] = ""
    created_at: Optional[str] = None


class AdminProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=254)
    original_email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=40)
    license_number: Optional[str] = Field(default=None, max_length=80)
    title: Optional[str] = Field(default=None, max_length=120)
    brokerage: Optional[str] = Field(default=None, max_length=120)
    bio: Optional[str] = Field(default=None, max_length=2000)
    avatar_url: Optional[str] = Field(default=None, max_length=4500000)

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_image_url(v, max_data_url_bytes=3 * 1024 * 1024, default="assets/images/agent.jpg")


class GoogleRegistrationComplete(BaseModel):
    email: str = Field(..., min_length=3, max_length=254, description="Google account email address")
    code: str = Field(..., pattern=r"^[0-9]{6}$", description="6-digit email verification code")
    terms_accepted: bool = Field(..., description="Must be true to agree to Terms of Service and Privacy Policy")
    credential: Optional[str] = Field(default=None, max_length=8192)
    access_token: Optional[str] = Field(default=None, max_length=4096)
    full_name: Optional[str] = Field(default=None, max_length=120)
    avatar_url: Optional[str] = Field(default=None, max_length=2048)
    google_id: Optional[str] = Field(default=None, max_length=128)
    phone: Optional[str] = Field(default="", max_length=40)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128, description="Current account password")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password (minimum 8 characters)")
    email: Optional[str] = Field(None, max_length=254, description="Account email address")


class AuthResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[UserResponse] = None
    redirect_url: Optional[str] = None
    message: Optional[str] = None
    requires_verification: Optional[bool] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


# ==========================================================
# PROPERTY SCHEMAS
# ==========================================================

class PropertyCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=160, description="Listing title")
    location: str = Field(..., min_length=2, max_length=200, description="Property city and location")
    property_type: str = Field(..., min_length=2, max_length=80, description="Property type")
    price: float = Field(..., gt=0, le=10000000000, description="Selling price in Philippine Pesos")
    bedrooms: Optional[int] = Field(default=3, ge=0, le=100, description="Number of bedrooms")
    bathrooms: Optional[int] = Field(default=2, ge=0, le=100, description="Number of bathrooms")
    lot_area: Optional[float] = Field(default=120.0, ge=0, le=1000000, description="Lot area in square meters")
    floor_area: Optional[float] = Field(default=80.0, ge=0, le=1000000, description="Floor area in square meters")
    carports: Optional[int] = Field(default=1, ge=0, le=50, description="Car parking slots / carport")
    storeys: Optional[int] = Field(default=2, ge=1, le=200, description="Number of storeys/floors")
    status: Optional[str] = Field(default="Available", max_length=40)
    image_url: Optional[str] = Field(default="assets/images/property1.jpg", max_length=4500000)
    description: Optional[str] = Field(default="", max_length=5000)
    amenities: Optional[str] = Field(default="", max_length=2000, description="Key features and amenities")

    @field_validator("image_url")
    @classmethod
    def validate_image(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return "assets/images/property1.jpg"
        return sanitize_image_url(v, max_data_url_bytes=3 * 1024 * 1024, default="assets/images/property1.jpg")


class PropertyUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=160)
    location: Optional[str] = Field(default=None, min_length=2, max_length=200)
    property_type: Optional[str] = Field(default=None, min_length=2, max_length=80)
    price: Optional[float] = Field(default=None, gt=0, le=10000000000)
    bedrooms: Optional[int] = Field(default=None, ge=0, le=100)
    bathrooms: Optional[int] = Field(default=None, ge=0, le=100)
    lot_area: Optional[float] = Field(default=None, ge=0, le=1000000)
    floor_area: Optional[float] = Field(default=None, ge=0, le=1000000)
    carports: Optional[int] = Field(default=None, ge=0, le=50)
    storeys: Optional[int] = Field(default=None, ge=1, le=200)
    status: Optional[str] = Field(default=None, max_length=40)
    image_url: Optional[str] = Field(default=None, max_length=4500000)
    description: Optional[str] = Field(default=None, max_length=5000)
    amenities: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("image_url")
    @classmethod
    def validate_image(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_image_url(v, max_data_url_bytes=3 * 1024 * 1024, default="assets/images/property1.jpg")


class PropertyResponse(BaseModel):
    id: int
    title: str
    location: str
    property_type: str
    price: float
    bedrooms: Optional[int] = 3
    bathrooms: Optional[int] = 2
    lot_area: Optional[float] = 120.0
    floor_area: Optional[float] = 80.0
    carports: Optional[int] = 1
    storeys: Optional[int] = 2
    status: Optional[str] = "Available"
    image_url: Optional[str] = ""
    description: Optional[str] = ""
    amenities: Optional[str] = ""
    created_at: Optional[str] = None


# ==========================================================
# INQUIRY SCHEMAS
# ==========================================================

class InquiryCreate(_BotProtectedMixin):
    client_name: str = Field(..., min_length=2, max_length=120)
    client_email: str = Field(..., min_length=3, max_length=254)
    client_phone: Optional[str] = Field(default="", max_length=40)
    property_id: Optional[int] = Field(default=None, ge=1)
    property_title: Optional[str] = Field(default="General Inquiry", max_length=200)
    message: str = Field(..., min_length=1, max_length=3000)
    status: Optional[str] = Field(default="Under Review", max_length=40)


class InquiryResponse(BaseModel):
    id: int
    client_name: str
    client_email: str
    client_phone: Optional[str] = ""
    property_title: Optional[str] = "General Inquiry"
    message: str
    status: str = "Under Review"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class InquiryUpdate(BaseModel):
    property_title: Optional[str] = Field(default=None, max_length=200)
    client_phone: Optional[str] = Field(default=None, max_length=40)
    message: Optional[str] = Field(default=None, max_length=3000)
    status: Optional[str] = Field(default=None, max_length=40)


# ==========================================================
# SUPERADMIN SCHEMAS
# ==========================================================

class UserRoleUpdate(BaseModel):
    role: str = Field(..., max_length=20, description="Target role: 'user', 'admin', or 'superadmin'")


class SuperadminCreateUser(BaseModel):
    email: str = Field(..., min_length=3, max_length=254, description="New user email address")
    password: str = Field(..., min_length=8, max_length=128, description="Account password")
    full_name: str = Field(..., min_length=2, max_length=120, description="Full legal name")
    phone: Optional[str] = Field(default="", max_length=40, description="Contact phone number")
    role: Optional[str] = Field(default="user", max_length=20, description="Account role ('user', 'admin')")


class SuperadminUpdateUser(BaseModel):
    full_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=254)
    original_email: Optional[str] = Field(default=None, max_length=254)
    phone: Optional[str] = Field(default=None, max_length=40)
    role: Optional[str] = Field(default=None, max_length=20)
    password: Optional[str] = Field(default=None, max_length=128)
