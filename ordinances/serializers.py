from rest_framework import serializers

from accounts.views import managed_document_kinds

from .models import Ordinance, OrdinanceAuthor, OrdinanceCategory


class OrdinanceSerializer(serializers.ModelSerializer):
    """
    Read side — used for both the public citizen list/detail (guests can
    browse ordinances without an account) and the staff list/detail. Never
    exposes pdf_file directly (a storage path); pdf_url is the absolute,
    downloadable link.
    """

    pdf_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Ordinance
        fields = [
            "id", "kind", "kind_display", "number", "title", "author", "category", "date_approved",
            "description", "pdf_url", "uploaded_by_name", "is_archived",
            "created_at", "updated_at",
        ]

    def get_pdf_url(self, obj):
        if not obj.pdf_file:
            return None
        request = self.context.get("request")
        url = obj.pdf_file.url
        return request.build_absolute_uri(url) if request else url

    def get_uploaded_by_name(self, obj):
        if not obj.uploaded_by:
            return None
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username


# There's exactly one Punong Barangay and one SK Chairperson at a time, unlike
# Barangay Kagawad (7 seats) — same "one active holder" idea as
# accounts.serializers.UNIQUE_STAFF_ROLES/validate_staff_role_uniqueness for
# Secretary/Barangay Captain, applied here to the author roster instead.
SINGLE_SEAT_POSITIONS = {OrdinanceAuthor.Position.BARANGAY_CAPTAIN, OrdinanceAuthor.Position.SK_CHAIRPERSON}


class OrdinanceAuthorSerializer(serializers.ModelSerializer):
    """
    The author roster — read by Upload/Edit Ordinance to build the Author
    field's autocomplete suggestions, and managed (create/edit/deactivate) by
    an Administrator on the Admin Portal's Ordinance Setup page.
    """

    position_display = serializers.CharField(source="get_position_display", read_only=True)

    class Meta:
        model = OrdinanceAuthor
        fields = ["id", "name", "position", "position_display", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        # A PATCH that touches neither field falls back to the existing
        # instance's values, so e.g. renaming the sitting Captain doesn't trip
        # this against themselves (excluded below by pk).
        position = attrs.get("position", getattr(self.instance, "position", None))
        is_active = attrs.get("is_active", getattr(self.instance, "is_active", True))

        if position in SINGLE_SEAT_POSITIONS and is_active:
            clash = OrdinanceAuthor.objects.filter(position=position, is_active=True)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                label = OrdinanceAuthor.Position(position).label
                raise serializers.ValidationError(
                    f"There's already an active {label}. Only one is allowed at a time."
                )
        return attrs


class OrdinanceCategorySerializer(serializers.ModelSerializer):
    """
    The category list — read by Upload/Edit Ordinance to build the Category
    dropdown, and managed (add/rename/retire) by an Administrator on the same
    Ordinance Setup page as the author roster. Unlike authors, this list *is*
    enforced (see OrdinanceCreateSerializer/OrdinanceUpdateSerializer's
    validate_category) — see OrdinanceCategory's docstring for why.
    """

    class Meta:
        model = OrdinanceCategory
        fields = ["id", "name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class _ValidateCategoryMixin:
    """Shared by create/update below — category must name a currently-active OrdinanceCategory."""

    def validate_category(self, value):
        if not OrdinanceCategory.objects.filter(name=value, is_active=True).exists():
            raise serializers.ValidationError("Select a category from the list.")
        return value


class _ValidateKindMixin:
    """
    The uploader may only file the kind(s) they manage — Secretary ordinances,
    Barangay Treasurer resolutions, Administrator either (see
    accounts.views.managed_document_kinds). Needs the request in context.
    """

    def validate_kind(self, value):
        request = self.context.get("request")
        if value not in managed_document_kinds(request.user if request else None):
            label = Ordinance.Kind(value).label.lower()
            raise serializers.ValidationError(f"You can't file a {label}.")
        return value


class OrdinanceCreateSerializer(_ValidateCategoryMixin, _ValidateKindMixin, serializers.ModelSerializer):
    """
    POST — Staff/Admin uploading a new ordinance or resolution. The PDF is
    required on creation. `kind` may be left out: it then defaults to the
    one kind the uploader manages (Administrators default to ordinance).
    """

    kind = serializers.ChoiceField(choices=Ordinance.Kind.choices, required=False)

    class Meta:
        model = Ordinance
        fields = ["kind", "number", "title", "author", "category", "date_approved", "description", "pdf_file"]
        extra_kwargs = {"pdf_file": {"required": True}}

    def validate(self, attrs):
        if "kind" not in attrs:
            request = self.context.get("request")
            kinds = managed_document_kinds(request.user if request else None)
            attrs["kind"] = next(iter(kinds)) if len(kinds) == 1 else Ordinance.Kind.ORDINANCE
        return attrs


class OrdinanceUpdateSerializer(_ValidateCategoryMixin, _ValidateKindMixin, serializers.ModelSerializer):
    """
    PATCH — Staff/Admin editing an existing ordinance or resolution. Replacing
    the PDF is optional. Changing `kind` is effectively Administrator-only
    (the new kind must also be one the editor manages).
    """

    class Meta:
        model = Ordinance
        fields = ["kind", "number", "title", "author", "category", "date_approved", "description", "pdf_file"]
        extra_kwargs = {"pdf_file": {"required": False}}
