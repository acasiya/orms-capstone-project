from PIL import Image
from rest_framework import serializers

from .models import AboutLogo, BarangayProfile, CouncilMember

MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


def validate_image_upload(file):
    """ImageField already rejects non-images; this also caps size and format."""
    if file.size > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Image must be 5 MB or smaller.")
    try:
        file.seek(0)
        fmt = Image.open(file).format
    except Exception:
        raise serializers.ValidationError("Upload a valid JPG, PNG or WebP image.")
    finally:
        file.seek(0)
    if fmt not in ALLOWED_IMAGE_FORMATS:
        raise serializers.ValidationError("Upload a JPG, PNG or WebP image.")
    return file


def image_url(field, default_path):
    """An uploaded file's URL, else the seeded image under the frontend root."""
    if field:
        return field.url
    return f"/{default_path}" if default_path else ""


class BarangayProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = BarangayProfile
        fields = [
            "name", "city", "address", "phone", "email", "office_hours",
            "emergency_hotline", "about_text", "mission_text", "updated_at",
        ]
        read_only_fields = ["updated_at"]
        extra_kwargs = {"name": {"allow_blank": False}}


class CouncilMemberSerializer(serializers.ModelSerializer):
    photo = serializers.ImageField(write_only=True, required=False)
    photoUrl = serializers.SerializerMethodField()
    # The seeded portraits (frontend/citizen/drawables/) have their green ring
    # drawn into the image; uploads don't, so the page adds one for them.
    hasCustomPhoto = serializers.SerializerMethodField()
    # Explicit default: in a multipart upload DRF otherwise reads a missing
    # checkbox as False, silently creating the member hidden.
    is_visible = serializers.BooleanField(required=False, default=True)
    group_display = serializers.CharField(source="get_group_display", read_only=True)

    class Meta:
        model = CouncilMember
        fields = [
            "id", "name", "position", "group", "group_display", "photo", "photoUrl",
            "hasCustomPhoto", "order", "is_visible",
        ]
        read_only_fields = ["id", "order"]

    def get_photoUrl(self, obj):
        return image_url(obj.photo, obj.default_photo)

    def get_hasCustomPhoto(self, obj):
        return bool(obj.photo)

    def validate_photo(self, file):
        return validate_image_upload(file)


class AboutLogoSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True, required=False)
    imageUrl = serializers.SerializerMethodField()
    is_visible = serializers.BooleanField(required=False, default=True)  # see CouncilMemberSerializer

    class Meta:
        model = AboutLogo
        fields = ["id", "image", "imageUrl", "alt_text", "order", "is_visible"]
        read_only_fields = ["id", "order"]

    def get_imageUrl(self, obj):
        return image_url(obj.image, obj.default_image)

    def validate_image(self, file):
        return validate_image_upload(file)

    def validate(self, attrs):
        # A new logo needs a picture; an edit can change just the alt text.
        if self.instance is None and not attrs.get("image"):
            raise serializers.ValidationError({"image": "Choose an image for this logo."})
        return attrs


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
