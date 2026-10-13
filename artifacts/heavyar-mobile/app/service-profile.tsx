import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  HardHat,
  RefreshCw,
  Save,
  Truck,
} from "lucide-react-native";
import { Text, XStack, YStack } from "tamagui";
import AppDialog from "@/components/AppDialog";
import {
  HeavyarBadge,
  HeavyarBadgeText,
  HeavyarButton,
  HeavyarButtonText,
  HeavyarChip,
  HeavyarChipText,
  HeavyarIconButton,
  HeavyarInput,
  HeavyarScreen,
  HeavyarSegment,
  HeavyarSegmentText,
  HeavyarSegmentedControl,
  HeavyarSubtitle,
  HeavyarSurface,
  HeavyarTitle,
  useHeavyarDirection,
} from "@/components/ui/heavyar";
import { useAppDialog } from "@/hooks/useAppDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { mockCategories } from "@/mocks/categories";
import {
  getOrganizationServiceProfile,
  getPersonalServiceProfiles,
  saveOrganizationServiceProfile,
  savePersonalServiceProfile,
  type OperatorDraft,
  type ServiceAvailability,
  type ServiceProfile,
  type ServiceProfileKind,
  type TransporterDraft,
} from "@/services/serviceProfileService";

const AVAILABILITY: ServiceAvailability[] = ["available", "busy", "offline"];
const VEHICLE_CATEGORIES: TransporterDraft["vehicleCategory"][] = [
  "lowbed",
  "flatbed",
  "trailer",
  "recovery",
  "other",
];

type OperatorForm = Omit<OperatorDraft, "yearsExperience" | "declarations"> & {
  yearsExperience: string;
  credentialTitle: string;
  credentialIssuer: string;
};
type TransporterForm = Omit<
  TransporterDraft,
  "capacityKg" | "dimensionsMm" | "declarations"
> & {
  capacityKg: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  permitTitle: string;
  permitIssuer: string;
};

function emptyOperatorForm(): OperatorForm {
  return {
    equipmentCategories: [],
    yearsExperience: "",
    serviceArea: { countryCode: "SA", region: "", city: "" },
    availability: "offline",
    description: "",
    credentialTitle: "",
    credentialIssuer: "",
  };
}

function emptyTransporterForm(): TransporterForm {
  return {
    vehicleCategory: "lowbed",
    vehicleType: "",
    capacityKg: "",
    lengthMm: "",
    widthMm: "",
    heightMm: "",
    serviceArea: { countryCode: "SA", region: "", city: "" },
    availability: "offline",
    description: "",
    permitTitle: "",
    permitIssuer: "",
  };
}

type ProfileContext = {
  key: string;
  uid: string;
  organizationId: string;
  kind: ServiceProfileKind | null;
};

function integer(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

export default function ServiceProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    organizationId?: string;
    kind?: string;
  }>();
  const organizationId =
    typeof params.organizationId === "string" ? params.organizationId : "";
  const lockedKind =
    params.kind === "operator" || params.kind === "transporter"
      ? params.kind
      : null;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isRTL } = useLanguage();
  const direction = useHeavyarDirection();
  const { dialog, showDialog, hideDialog } = useAppDialog();
  const uid = user?.uid || "";
  const message = useCallback(
    (ar: string, en: string) => (isRTL ? ar : en),
    [isRTL],
  );
  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const [kind, setKind] = useState<ServiceProfileKind>(
    lockedKind || "operator",
  );
  const activeKind = lockedKind || kind;
  const contextKind = organizationId ? activeKind : null;
  const contextKey = JSON.stringify([uid, organizationId, contextKind || "personal"]);
  const contextKeyRef = useRef(contextKey);
  contextKeyRef.current = contextKey;
  const mounted = useRef(false);
  const contextEpoch = useRef(0);
  const loadGeneration = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const saveController = useRef<AbortController | null>(null);
  const [operatorProfile, setOperatorProfile] =
    useState<ServiceProfile<"operator"> | null>(null);
  const [transporterProfile, setTransporterProfile] =
    useState<ServiceProfile<"transporter"> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [renderContextKey, setRenderContextKey] = useState(contextKey);
  const [operator, setOperator] = useState<OperatorForm>(emptyOperatorForm);
  const [transporter, setTransporter] =
    useState<TransporterForm>(emptyTransporterForm);

  const applyOperator = useCallback(
    (profile: ServiceProfile<"operator"> | null) => {
      setOperatorProfile(profile);
      if (!profile) {
        setOperator(emptyOperatorForm());
        return;
      }
      const credential = profile.draft.declarations[0];
      setOperator({
        equipmentCategories: profile.draft.equipmentCategories,
        yearsExperience: String(profile.draft.yearsExperience),
        serviceArea: profile.draft.serviceArea,
        availability: profile.draft.availability,
        description: profile.draft.description,
        credentialTitle: credential?.title || "",
        credentialIssuer: credential?.issuer || "",
      });
    },
    [],
  );
  const applyTransporter = useCallback(
    (profile: ServiceProfile<"transporter"> | null) => {
      setTransporterProfile(profile);
      if (!profile) {
        setTransporter(emptyTransporterForm());
        return;
      }
      const permit = profile.draft.declarations[0];
      setTransporter({
        vehicleCategory: profile.draft.vehicleCategory,
        vehicleType: profile.draft.vehicleType,
        capacityKg: String(profile.draft.capacityKg),
        lengthMm: String(profile.draft.dimensionsMm.length),
        widthMm: String(profile.draft.dimensionsMm.width),
        heightMm: String(profile.draft.dimensionsMm.height),
        serviceArea: profile.draft.serviceArea,
        availability: profile.draft.availability,
        description: profile.draft.description,
        permitTitle: permit?.title || "",
        permitIssuer: permit?.issuer || "",
      });
    },
    [],
  );

  const resetDraftState = useCallback(() => {
    setOperatorProfile(null);
    setTransporterProfile(null);
    setOperator(emptyOperatorForm());
    setTransporter(emptyTransporterForm());
    setError("");
  }, []);

  const contextIsCurrent = useCallback(
    (profileContext: ProfileContext, epoch: number, signal?: AbortSignal) =>
      mounted.current &&
      !signal?.aborted &&
      contextEpoch.current === epoch &&
      contextKeyRef.current === profileContext.key,
    [],
  );

  const load = useCallback(
    async (
      profileContext: ProfileContext,
      epoch: number,
      signal?: AbortSignal,
    ) => {
      if (!profileContext.uid || !contextIsCurrent(profileContext, epoch, signal))
        return false;
      const currentLoad = ++loadGeneration.current;
      setLoading(true);
      setError("");
      try {
        if (profileContext.organizationId && profileContext.kind) {
          const profile = await getOrganizationServiceProfile(
            profileContext.uid,
            profileContext.organizationId,
            profileContext.kind,
            signal,
          );
          if (
            !contextIsCurrent(profileContext, epoch, signal) ||
            currentLoad !== loadGeneration.current
          )
            return false;
          if (profileContext.kind === "operator")
            applyOperator(profile as ServiceProfile<"operator"> | null);
          else
            applyTransporter(profile as ServiceProfile<"transporter"> | null);
        } else {
          const profiles = await getPersonalServiceProfiles(
            profileContext.uid,
            signal,
          );
          if (
            !contextIsCurrent(profileContext, epoch, signal) ||
            currentLoad !== loadGeneration.current
          )
            return false;
          applyOperator(profiles.operator);
          applyTransporter(profiles.transporter);
        }
        return true;
      } catch {
        if (
          contextIsCurrent(profileContext, epoch, signal) &&
          currentLoad === loadGeneration.current
        )
          setError(
            message(
              "تعذر تحميل مسودة ملف الخدمة. تحقق من الاتصال أو الصلاحية.",
              "The service-profile draft could not be loaded. Check connectivity or permission.",
            ),
          );
        return false;
      } finally {
        if (
          contextIsCurrent(profileContext, epoch, signal) &&
          currentLoad === loadGeneration.current
        )
          setLoading(false);
      }
    },
    [
      applyOperator,
      applyTransporter,
      contextIsCurrent,
      message,
    ],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      contextEpoch.current += 1;
      loadGeneration.current += 1;
      loadController.current?.abort();
      saveController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const epoch = ++contextEpoch.current;
    loadGeneration.current += 1;
    loadController.current?.abort();
    saveController.current?.abort();
    loadController.current = null;
    saveController.current = null;
    setSaving(false);
    hideDialog();
    resetDraftState();
    if (!organizationId) setKind("operator");
    else if (contextKind) setKind(contextKind);
    setRenderContextKey(contextKey);

    if (!uid) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    loadController.current = controller;
    const profileContext: ProfileContext = {
      key: contextKey,
      uid,
      organizationId,
      kind: contextKind,
    };
    void load(profileContext, epoch, controller.signal);
    return () => controller.abort();
  }, [
    contextKey,
    contextKind,
    hideDialog,
    load,
    organizationId,
    resetDraftState,
    uid,
  ]);

  const refresh = useCallback(() => {
    if (!uid || renderContextKey !== contextKey) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    void load(
      { key: contextKey, uid, organizationId, kind: contextKind },
      contextEpoch.current,
      controller.signal,
    );
  }, [contextKey, contextKind, load, organizationId, renderContextKey, uid]);

  const setOperatorValue = <K extends keyof OperatorForm>(
    key: K,
    value: OperatorForm[K],
  ) => setOperator((current) => ({ ...current, [key]: value }));
  const setTransporterValue = <K extends keyof TransporterForm>(
    key: K,
    value: TransporterForm[K],
  ) => setTransporter((current) => ({ ...current, [key]: value }));
  const operatorYears = integer(operator.yearsExperience, 0, 80);
  const transportCapacity = integer(transporter.capacityKg, 1, 250_000);
  const transportLength = integer(transporter.lengthMm, 1, 50_000);
  const transportWidth = integer(transporter.widthMm, 1, 20_000);
  const transportHeight = integer(transporter.heightMm, 1, 20_000);
  const commonAreaValid = (area: OperatorForm["serviceArea"]) =>
    area.region.trim().length > 0 && (area.city || "").trim().length > 0;
  const operatorValid =
    operator.equipmentCategories.length > 0 &&
    operatorYears !== null &&
    commonAreaValid(operator.serviceArea) &&
    operator.description.length <= 1000;
  const transporterValid =
    transporter.vehicleType.trim().length >= 2 &&
    transportCapacity !== null &&
    transportLength !== null &&
    transportWidth !== null &&
    transportHeight !== null &&
    commonAreaValid(transporter.serviceArea) &&
    transporter.description.length <= 1000;

  const save = async () => {
    if (
      !uid ||
      saving ||
      saveController.current !== null ||
      loading ||
      renderContextKey !== contextKey ||
      (activeKind === "operator" && !operatorValid) ||
      (activeKind === "transporter" && !transporterValid)
    )
      return;
    const saveContext: ProfileContext = {
      key: contextKey,
      uid,
      organizationId,
      kind: activeKind,
    };
    const saveEpoch = contextEpoch.current;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true);
    try {
      if (activeKind === "operator") {
        const draft: OperatorDraft = {
          equipmentCategories: operator.equipmentCategories,
          yearsExperience: operatorYears!,
          serviceArea: {
            ...operator.serviceArea,
            region: operator.serviceArea.region.trim(),
            city: operator.serviceArea.city?.trim(),
          },
          availability: operator.availability,
          description: operator.description.trim(),
          declarations: operator.credentialTitle.trim()
            ? [
                {
                  kind: "qualification",
                  title: operator.credentialTitle.trim(),
                  ...(operator.credentialIssuer.trim()
                    ? { issuer: operator.credentialIssuer.trim() }
                    : {}),
                  declarationState: "declared_unverified",
                },
              ]
            : [],
        };
        if (organizationId)
          await saveOrganizationServiceProfile(
            uid,
            organizationId,
            "operator",
            operatorProfile?.revision || null,
            draft,
            controller.signal,
          );
        else
          await savePersonalServiceProfile(
            uid,
            "operator",
            operatorProfile?.revision || null,
            draft,
            controller.signal,
          );
      } else {
        const draft: TransporterDraft = {
          vehicleCategory: transporter.vehicleCategory,
          vehicleType: transporter.vehicleType.trim(),
          capacityKg: transportCapacity!,
          dimensionsMm: {
            length: transportLength!,
            width: transportWidth!,
            height: transportHeight!,
          },
          serviceArea: {
            ...transporter.serviceArea,
            region: transporter.serviceArea.region.trim(),
            city: transporter.serviceArea.city?.trim(),
          },
          availability: transporter.availability,
          description: transporter.description.trim(),
          declarations: transporter.permitTitle.trim()
            ? [
                {
                  kind: "transport_license",
                  title: transporter.permitTitle.trim(),
                  ...(transporter.permitIssuer.trim()
                    ? { issuer: transporter.permitIssuer.trim() }
                    : {}),
                  declarationState: "declared_unverified",
                },
              ]
            : [],
        };
        if (organizationId)
          await saveOrganizationServiceProfile(
            uid,
            organizationId,
            "transporter",
            transporterProfile?.revision || null,
            draft,
            controller.signal,
          );
        else
          await savePersonalServiceProfile(
            uid,
            "transporter",
            transporterProfile?.revision || null,
            draft,
            controller.signal,
          );
      }
      if (!contextIsCurrent(saveContext, saveEpoch, controller.signal)) return;
      const loaded = await load(saveContext, saveEpoch, controller.signal);
      if (
        !loaded ||
        !contextIsCurrent(saveContext, saveEpoch, controller.signal)
      )
        return;
      showDialog(
        message("تم حفظ المسودة", "Draft saved"),
        message(
          "بقيت البيانات مُعلنة وغير موثّقة، ولم تُنشر للخدمات أو الطلبات.",
          "The data remains declared and unverified; it was not published for discovery or requests.",
        ),
        [{ text: message("حسنًا", "OK"), style: "default" }],
      );
    } catch {
      if (contextIsCurrent(saveContext, saveEpoch, controller.signal))
        showDialog(
          message("تعذر الحفظ", "Save failed"),
          message(
            "حدّث المسودة وتأكد من الحقول والصلاحية ثم حاول مجددًا.",
            "Refresh the draft, verify the fields and permission, then try again.",
          ),
          [{ text: message("حسنًا", "OK"), style: "default" }],
        );
    } finally {
      if (contextIsCurrent(saveContext, saveEpoch, controller.signal))
        setSaving(false);
      if (saveController.current === controller) saveController.current = null;
    }
  };

  const availabilityLabel = (value: ServiceAvailability) =>
    ({
      available: message("متاح حسب الإفادة", "Declared available"),
      busy: message("مشغول", "Busy"),
      offline: message("غير متاح", "Unavailable"),
    })[value];
  const vehicleLabel = (value: TransporterDraft["vehicleCategory"]) =>
    ({
      lowbed: message("لوبد", "Lowbed"),
      flatbed: message("سطحة", "Flatbed"),
      trailer: message("مقطورة", "Trailer"),
      recovery: message("سطحة إنقاذ", "Recovery"),
      other: message("أخرى", "Other"),
    })[value];
  const contextReady = renderContextKey === contextKey;
  const profile = contextReady
    ? activeKind === "operator"
      ? operatorProfile
      : transporterProfile
    : null;

  if (!authLoading && (!isAuthenticated || !user))
    return (
      <HeavyarScreen items="center" justify="center" p="$lg">
        <HeavyarSubtitle>
          {message(
            "سجّل الدخول لإدارة مسودة ملف الخدمة.",
            "Sign in to manage a service-profile draft.",
          )}
        </HeavyarSubtitle>
      </HeavyarScreen>
    );
  return (
    <HeavyarScreen>
      <SafeAreaView style={{ flex: 1 }}>
        <XStack
          items="center"
          justify="space-between"
          px="$md"
          py="$sm"
          flexDirection={direction.rowDirection}
        >
          <HeavyarIconButton
            tone="ghost"
            accessibilityLabel={message("رجوع", "Back")}
            onPress={() => router.back()}
          >
            <BackIcon size={23} color="#FFFFFF" />
          </HeavyarIconButton>
          <YStack flex={1} mx="$sm">
            <HeavyarTitle style={{ textAlign: direction.textAlign }}>
              {message("ملفات الخدمات", "Service profiles")}
            </HeavyarTitle>
            <HeavyarSubtitle style={{ textAlign: direction.textAlign }}>
              {organizationId
                ? message("مسودة باسم المنشأة", "Organization-owned draft")
                : message(
                    "مسودة شخصية منفصلة عن دور الحساب",
                    "Personal draft separate from account role",
                  )}
            </HeavyarSubtitle>
          </YStack>
          <HeavyarIconButton
            tone="subtle"
            accessibilityLabel={message("تحديث", "Refresh")}
            onPress={refresh}
          >
            <RefreshCw size={20} color="#F1B61D" />
          </HeavyarIconButton>
        </XStack>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
          >
            <YStack gap="$md">
              {!lockedKind ? (
                <HeavyarSegmentedControl>
                  {(["operator", "transporter"] as ServiceProfileKind[]).map(
                    (item) => (
                      <HeavyarSegment
                        key={item}
                        selected={kind === item}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: kind === item }}
                        onPress={() => setKind(item)}
                      >
                        {item === "operator" ? (
                          <HardHat
                            size={18}
                            color={kind === item ? "#F1B61D" : "#8FA6C2"}
                          />
                        ) : (
                          <Truck
                            size={18}
                            color={kind === item ? "#F1B61D" : "#8FA6C2"}
                          />
                        )}
                        <HeavyarSegmentText selected={kind === item}>
                          {item === "operator"
                            ? message("مشغّل معدات", "Operator")
                            : message("ناقل معدات", "Transporter")}
                        </HeavyarSegmentText>
                      </HeavyarSegment>
                    ),
                  )}
                </HeavyarSegmentedControl>
              ) : null}
              <HeavyarSurface tone="raised">
                <YStack gap="$sm">
                  <XStack
                    items="center"
                    justify="space-between"
                    flexDirection={direction.rowDirection}
                  >
                    <XStack
                      items="center"
                      gap="$sm"
                      flexDirection={direction.rowDirection}
                    >
                      <BadgeCheck size={22} color="#F1B61D" />
                      <Text color="$color" fontWeight="800">
                        {message("حالة المسودة", "Draft status")}
                      </Text>
                    </XStack>
                    <HeavyarBadge tone="warning">
                      <HeavyarBadgeText>
                        {message("مُعلن — غير موثّق", "Declared — unverified")}
                      </HeavyarBadgeText>
                    </HeavyarBadge>
                  </XStack>
                  <Text
                    color="$colorMuted"
                    fontSize={12}
                    lineHeight={18}
                    style={{ textAlign: direction.textAlign }}
                  >
                    {message(
                      "الحفظ لا يفعّل الظهور العام أو استقبال الطلبات، ولا يثبت الترخيص أو التأهيل أو التأمين.",
                      "Saving does not enable public discovery or requests and does not prove licensing, qualifications or insurance.",
                    )}
                  </Text>
                  {profile ? (
                    <Text
                      color="$accent"
                      fontSize={12}
                      fontWeight="700"
                      style={{ textAlign: direction.textAlign }}
                    >
                      {message("مسودة محفوظة على الخادم", "Server draft saved")}
                    </Text>
                  ) : null}
                </YStack>
              </HeavyarSurface>
              {contextReady && error ? (
                <HeavyarSurface
                  tone="subtle"
                  density="compact"
                  borderColor="$danger"
                >
                  <Text
                    color="$danger"
                    style={{ textAlign: direction.textAlign }}
                  >
                    {error}
                  </Text>
                  <HeavyarButton
                    tone="ghost"
                    compact
                    onPress={refresh}
                  >
                    <HeavyarButtonText tone="ghost">
                      {message("إعادة المحاولة", "Retry")}
                    </HeavyarButtonText>
                  </HeavyarButton>
                </HeavyarSurface>
              ) : null}
              {!contextReady || loading || authLoading ? (
                <YStack items="center" py="$xl" gap="$sm">
                  <ActivityIndicator color="#F1B61D" />
                  <HeavyarSubtitle>
                    {message("جارٍ تحميل المسودة…", "Loading draft…")}
                  </HeavyarSubtitle>
                </YStack>
              ) : activeKind === "operator" ? (
                <>
                  <HeavyarSurface>
                    <YStack gap="$md">
                      <Text
                        color="$color"
                        fontSize={17}
                        fontWeight="800"
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message("خبرة التشغيل", "Operating experience")}
                      </Text>
                      <Text
                        color="$colorMuted"
                        fontSize={12}
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message("فئات المعدات", "Equipment categories")}
                      </Text>
                      <XStack
                        gap="$xs"
                        flexWrap="wrap"
                        flexDirection={direction.rowDirection}
                      >
                        {mockCategories.map((item) => {
                          const selected =
                            operator.equipmentCategories.includes(item.id);
                          return (
                            <HeavyarChip
                              key={item.id}
                              selected={selected}
                              accessibilityState={{ selected }}
                              onPress={() =>
                                setOperatorValue(
                                  "equipmentCategories",
                                  selected
                                    ? operator.equipmentCategories.filter(
                                        (id) => id !== item.id,
                                      )
                                    : [
                                        ...operator.equipmentCategories,
                                        item.id,
                                      ],
                                )
                              }
                            >
                              <HeavyarChipText selected={selected}>
                                {isRTL ? item.nameAr : item.nameEn}
                              </HeavyarChipText>
                            </HeavyarChip>
                          );
                        })}
                      </XStack>
                      <Text
                        color="$colorMuted"
                        fontSize={12}
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "سنوات الخبرة (0–80)",
                          "Years of experience (0–80)",
                        )}
                      </Text>
                      <HeavyarInput
                        value={operator.yearsExperience}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setOperatorValue("yearsExperience", value)
                        }
                        style={{ textAlign: direction.textAlign }}
                      />
                    </YStack>
                  </HeavyarSurface>
                  <ServiceAreaFields
                    message={message}
                    direction={direction}
                    value={operator.serviceArea}
                    onChange={(value) => setOperatorValue("serviceArea", value)}
                  />
                  <AvailabilityFields
                    message={message}
                    direction={direction}
                    value={operator.availability}
                    onChange={(value) =>
                      setOperatorValue("availability", value)
                    }
                    label={availabilityLabel}
                  />
                  <HeavyarSurface>
                    <YStack gap="$sm">
                      <Text
                        color="$color"
                        fontSize={17}
                        fontWeight="800"
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "مؤهل مُعلن (اختياري)",
                          "Declared qualification (optional)",
                        )}
                      </Text>
                      <HeavyarSubtitle
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "سيُحفظ كإقرار غير موثّق ولن ينتج شارة اعتماد.",
                          "Stored as an unverified declaration and never creates a verified badge.",
                        )}
                      </HeavyarSubtitle>
                      <HeavyarInput
                        value={operator.credentialTitle}
                        onChangeText={(value) =>
                          setOperatorValue("credentialTitle", value)
                        }
                        placeholder={message(
                          "اسم الشهادة أو التصريح",
                          "Qualification or permit title",
                        )}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <HeavyarInput
                        value={operator.credentialIssuer}
                        onChangeText={(value) =>
                          setOperatorValue("credentialIssuer", value)
                        }
                        placeholder={message(
                          "الجهة المُصدرة",
                          "Issuing authority",
                        )}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <HeavyarInput
                        multiline
                        value={operator.description}
                        onChangeText={(value) =>
                          setOperatorValue("description", value)
                        }
                        placeholder={message(
                          "وصف مختصر للخدمة",
                          "Short service description",
                        )}
                        style={{
                          minHeight: 96,
                          textAlign: direction.textAlign,
                        }}
                      />
                    </YStack>
                  </HeavyarSurface>
                </>
              ) : (
                <>
                  <HeavyarSurface>
                    <YStack gap="$md">
                      <Text
                        color="$color"
                        fontSize={17}
                        fontWeight="800"
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "مركبة النقل المعلنة",
                          "Declared transport vehicle",
                        )}
                      </Text>
                      <XStack
                        gap="$xs"
                        flexWrap="wrap"
                        flexDirection={direction.rowDirection}
                      >
                        {VEHICLE_CATEGORIES.map((item) => (
                          <HeavyarChip
                            key={item}
                            selected={transporter.vehicleCategory === item}
                            accessibilityState={{
                              selected: transporter.vehicleCategory === item,
                            }}
                            onPress={() =>
                              setTransporterValue("vehicleCategory", item)
                            }
                          >
                            <HeavyarChipText
                              selected={transporter.vehicleCategory === item}
                            >
                              {vehicleLabel(item)}
                            </HeavyarChipText>
                          </HeavyarChip>
                        ))}
                      </XStack>
                      <HeavyarInput
                        value={transporter.vehicleType}
                        onChangeText={(value) =>
                          setTransporterValue("vehicleType", value)
                        }
                        placeholder={message("نوع المركبة", "Vehicle type")}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <HeavyarInput
                        value={transporter.capacityKg}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setTransporterValue("capacityKg", value)
                        }
                        placeholder={message(
                          "الحمولة بالكيلوغرام",
                          "Capacity in kilograms",
                        )}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <Text
                        color="$colorMuted"
                        fontSize={12}
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "الأبعاد بالملليمتر: الطول، العرض، الارتفاع",
                          "Dimensions in millimeters: length, width, height",
                        )}
                      </Text>
                      <XStack gap="$sm" flexDirection={direction.rowDirection}>
                        <HeavyarInput
                          flex={1}
                          value={transporter.lengthMm}
                          keyboardType="number-pad"
                          onChangeText={(value) =>
                            setTransporterValue("lengthMm", value)
                          }
                          placeholder={message("الطول", "Length")}
                        />
                        <HeavyarInput
                          flex={1}
                          value={transporter.widthMm}
                          keyboardType="number-pad"
                          onChangeText={(value) =>
                            setTransporterValue("widthMm", value)
                          }
                          placeholder={message("العرض", "Width")}
                        />
                        <HeavyarInput
                          flex={1}
                          value={transporter.heightMm}
                          keyboardType="number-pad"
                          onChangeText={(value) =>
                            setTransporterValue("heightMm", value)
                          }
                          placeholder={message("الارتفاع", "Height")}
                        />
                      </XStack>
                    </YStack>
                  </HeavyarSurface>
                  <ServiceAreaFields
                    message={message}
                    direction={direction}
                    value={transporter.serviceArea}
                    onChange={(value) =>
                      setTransporterValue("serviceArea", value)
                    }
                  />
                  <AvailabilityFields
                    message={message}
                    direction={direction}
                    value={transporter.availability}
                    onChange={(value) =>
                      setTransporterValue("availability", value)
                    }
                    label={availabilityLabel}
                  />
                  <HeavyarSurface>
                    <YStack gap="$sm">
                      <Text
                        color="$color"
                        fontSize={17}
                        fontWeight="800"
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "ترخيص مُعلن (اختياري)",
                          "Declared licence (optional)",
                        )}
                      </Text>
                      <HeavyarSubtitle
                        style={{ textAlign: direction.textAlign }}
                      >
                        {message(
                          "معلومات المركبة أو الترخيص لا تثبت أهلية نشاط النقل.",
                          "Vehicle or licence information does not establish transport authority.",
                        )}
                      </HeavyarSubtitle>
                      <HeavyarInput
                        value={transporter.permitTitle}
                        onChangeText={(value) =>
                          setTransporterValue("permitTitle", value)
                        }
                        placeholder={message(
                          "اسم الرخصة أو التصريح",
                          "Licence or permit title",
                        )}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <HeavyarInput
                        value={transporter.permitIssuer}
                        onChangeText={(value) =>
                          setTransporterValue("permitIssuer", value)
                        }
                        placeholder={message(
                          "الجهة المُصدرة",
                          "Issuing authority",
                        )}
                        style={{ textAlign: direction.textAlign }}
                      />
                      <HeavyarInput
                        multiline
                        value={transporter.description}
                        onChangeText={(value) =>
                          setTransporterValue("description", value)
                        }
                        placeholder={message(
                          "وصف المركبة أو الخدمة",
                          "Vehicle or service description",
                        )}
                        style={{
                          minHeight: 96,
                          textAlign: direction.textAlign,
                        }}
                      />
                    </YStack>
                  </HeavyarSurface>
                </>
              )}
              {contextReady && !loading ? (
                <HeavyarButton
                  fullWidth
                  disabled={
                    saving ||
                    !contextReady ||
                    (activeKind === "operator" && !operatorValid) ||
                    (activeKind === "transporter" && !transporterValid)
                  }
                  accessibilityLabel={message(
                    "حفظ مسودة ملف الخدمة",
                    "Save service-profile draft",
                  )}
                  onPress={() => void save()}
                >
                  <Save size={18} color="#071A2F" />
                  <HeavyarButtonText>
                    {saving
                      ? message("جارٍ الحفظ…", "Saving…")
                      : message(
                          "حفظ كمسودة غير موثّقة",
                          "Save as unverified draft",
                        )}
                  </HeavyarButtonText>
                </HeavyarButton>
              ) : null}
            </YStack>
          </ScrollView>
        </KeyboardAvoidingView>
        <AppDialog
          visible={contextReady && dialog.visible}
          title={dialog.title}
          message={dialog.message}
          buttons={dialog.buttons}
          onClose={hideDialog}
        />
      </SafeAreaView>
    </HeavyarScreen>
  );
}

function ServiceAreaFields({
  message,
  direction,
  value,
  onChange,
}: {
  message: (ar: string, en: string) => string;
  direction: ReturnType<typeof useHeavyarDirection>;
  value: OperatorDraft["serviceArea"];
  onChange: (value: OperatorDraft["serviceArea"]) => void;
}) {
  return (
    <HeavyarSurface>
      <YStack gap="$sm">
        <Text
          color="$color"
          fontSize={17}
          fontWeight="800"
          style={{ textAlign: direction.textAlign }}
        >
          {message("منطقة الخدمة التقريبية", "Coarse service area")}
        </Text>
        <HeavyarSubtitle style={{ textAlign: direction.textAlign }}>
          {message(
            "لا تُحفظ إحداثيات دقيقة في هذا الملف.",
            "No precise coordinates are stored in this profile.",
          )}
        </HeavyarSubtitle>
        <HeavyarInput
          value={value.region}
          onChangeText={(region) => onChange({ ...value, region })}
          placeholder={message("المنطقة", "Region")}
          style={{ textAlign: direction.textAlign }}
        />
        <HeavyarInput
          value={value.city || ""}
          onChangeText={(city) => onChange({ ...value, city })}
          placeholder={message("المدينة", "City")}
          style={{ textAlign: direction.textAlign }}
        />
      </YStack>
    </HeavyarSurface>
  );
}

function AvailabilityFields({
  message,
  direction,
  value,
  onChange,
  label,
}: {
  message: (ar: string, en: string) => string;
  direction: ReturnType<typeof useHeavyarDirection>;
  value: ServiceAvailability;
  onChange: (value: ServiceAvailability) => void;
  label: (value: ServiceAvailability) => string;
}) {
  return (
    <HeavyarSurface>
      <YStack gap="$sm">
        <Text
          color="$color"
          fontSize={17}
          fontWeight="800"
          style={{ textAlign: direction.textAlign }}
        >
          {message("إفادة التوفر", "Availability declaration")}
        </Text>
        <HeavyarSubtitle style={{ textAlign: direction.textAlign }}>
          {message(
            "هذه إفادة فقط وليست فتحًا للحجز.",
            "This is a declaration only; it does not open booking.",
          )}
        </HeavyarSubtitle>
        <XStack
          gap="$xs"
          flexWrap="wrap"
          flexDirection={direction.rowDirection}
        >
          {AVAILABILITY.map((item) => (
            <HeavyarChip
              key={item}
              selected={value === item}
              accessibilityState={{ selected: value === item }}
              onPress={() => onChange(item)}
            >
              <HeavyarChipText selected={value === item}>
                {label(item)}
              </HeavyarChipText>
            </HeavyarChip>
          ))}
        </XStack>
      </YStack>
    </HeavyarSurface>
  );
}
