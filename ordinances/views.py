from rest_framework import generics, permissions, status
from rest_framework.response import Response

from accounts.models import log_action
from accounts.views import IsSecretaryOrAdmin

from .models import Ordinance
from .serializers import OrdinanceCreateSerializer, OrdinanceSerializer, OrdinanceUpdateSerializer


class OrdinanceListCreateView(generics.ListCreateAPIView):
    """
    GET /api/ordinances/ — every ordinance (public; citizens can browse
    without an account, same as the old hardcoded placeholder list).
    POST /api/ordinances/ — upload a new ordinance. Secretary/Admin only —
    Ordinances is a full-edit section for Secretary; Barangay Captain only
    gets a read-only view of it (see accounts.views.IsSecretaryOrAdmin).
    """
    queryset = Ordinance.objects.all()

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsSecretaryOrAdmin()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        return OrdinanceCreateSerializer if self.request.method == "POST" else OrdinanceSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ordinance = serializer.save()
        log_action(request.user, f"Uploaded ordinance {ordinance.number} — {ordinance.title}")
        return Response(
            OrdinanceSerializer(ordinance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrdinanceDetailView(generics.RetrieveUpdateAPIView):
    """
    GET /api/ordinances/<id>/ — one ordinance (public).
    PATCH /api/ordinances/<id>/ — edit it, optionally replacing the PDF. Secretary/Admin only.
    """
    queryset = Ordinance.objects.all()

    def get_permissions(self):
        if self.request.method in ("PATCH", "PUT"):
            return [IsSecretaryOrAdmin()]
        return [permissions.AllowAny()]

    def get_serializer_class(self):
        return OrdinanceUpdateSerializer if self.request.method in ("PATCH", "PUT") else OrdinanceSerializer

    def get_serializer_context(self):
        return {"request": self.request}

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        ordinance = serializer.save()
        log_action(request.user, f"Updated ordinance {ordinance.number} — {ordinance.title}")
        return Response(OrdinanceSerializer(ordinance, context={"request": request}).data)
