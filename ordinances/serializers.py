from rest_framework import serializers

from .models import Ordinance


class OrdinanceSerializer(serializers.ModelSerializer):
    """
    Read side — used for both the public citizen list/detail (guests can
    browse ordinances without an account) and the staff list/detail. Never
    exposes pdf_file directly (a storage path); pdf_url is the absolute,
    downloadable link.
    """

    pdf_url = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Ordinance
        fields = [
            "id", "number", "title", "author", "category", "date_approved",
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


class OrdinanceCreateSerializer(serializers.ModelSerializer):
    """POST — Staff/Admin uploading a new ordinance. The PDF is required on creation."""

    class Meta:
        model = Ordinance
        fields = ["number", "title", "author", "category", "date_approved", "description", "pdf_file"]
        extra_kwargs = {"pdf_file": {"required": True}}


class OrdinanceUpdateSerializer(serializers.ModelSerializer):
    """PATCH — Staff/Admin editing an existing ordinance. Replacing the PDF is optional."""

    class Meta:
        model = Ordinance
        fields = ["number", "title", "author", "category", "date_approved", "description", "pdf_file"]
        extra_kwargs = {"pdf_file": {"required": False}}
