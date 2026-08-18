from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """
    Public self-registration. Always creates a `citizen` role account —
    Staff and Admin accounts are created separately by an Administrator
    (see AdminCreateUserSerializer), never through open signup.
    """

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "contact_number", "address",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        # username isn't used for login, but Django's User model requires one;
        # derive it from email so it stays unique without asking the resident for it.
        validated_data["username"] = validated_data["email"]
        validated_data["role"] = User.Role.CITIZEN
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class AdminCreateUserSerializer(serializers.ModelSerializer):
    """Used by Administrators to create Staff or Admin accounts directly (pre-verified)."""

    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = [
            "id", "email", "password", "first_name", "last_name",
            "contact_number", "address", "role",
        ]
        read_only_fields = ["id"]

    def validate_role(self, value):
        if value == User.Role.CITIZEN:
            raise serializers.ValidationError(
                "Citizens self-register through /api/auth/register/, not this endpoint."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        validated_data["username"] = validated_data["email"]
        validated_data["is_verified"] = True
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    """Read-only profile info — used by the /api/auth/me/ endpoint."""

    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "name", "first_name", "last_name",
            "role", "contact_number", "address", "is_verified",
        ]

    def get_name(self, obj):
        return obj.get_full_name() or obj.username


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends SimpleJWT's login serializer so the token payload — and the
    login response body — includes role/name. This lets the frontend route
    the user to the right portal page and greet them by name without a
    second request right after login.
    """

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["name"] = user.get_full_name() or user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
