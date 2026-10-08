import type { ServiceInterest, TimelineType, DestinationType, SqftRange, HomeDensity } from "@/lib/types";

export interface SpaceOption {
  key: string;
  name: string;
  on: boolean;
  custom?: boolean;
}

export interface WizardData {
  firstName: string;
  lastName: string;
  currentZip: string;

  serviceInterests: ServiceInterest[];
  appOnlyIntent: boolean;

  timelineType: TimelineType | null;
  timelineValue: string; // chip key | "YYYY-MM" | ISO date

  destinationType: DestinationType | null;
  destinationZip: string;
  destinationCommunity: string; // LocalVendors record id (VendorType = "Future Home/Community")
  destinationCommunityName: string; // display only
  destinationCommunityOther: string;
  // "Did you hear about us from [community]?" asked right after picking a
  // listed community. Yes fills the step-7 answer and skips that step.
  communityReferred: boolean | null;

  sqftRange: SqftRange | null;
  sqftExact: number | null;
  homeDensity: HomeDensity | null;

  bedrooms: number;
  bathrooms: number;
  spaces: SpaceOption[];

  howHeard: string; // HOW_HEARD_OPTIONS key, "" until answered
  howHeardDetail: string; // referrer's name, typed or picked
  referralPartnerId: string; // marketplace listing id when picked from search
}

export const DEFAULT_SPACES: SpaceOption[] = [
  { key: "kitchen", name: "Kitchen", on: true },
  { key: "living_room", name: "Living Room", on: true },
  { key: "dining_room", name: "Dining Room", on: false },
  { key: "family_room", name: "Family Room", on: false },
  { key: "office", name: "Office", on: false },
  { key: "laundry", name: "Laundry", on: false },
  { key: "basement", name: "Basement", on: false },
  { key: "attic", name: "Attic", on: false },
  { key: "garage", name: "Garage", on: false },
  { key: "storage_unit", name: "Storage Unit", on: false },
  { key: "patio", name: "Patio / Outdoor", on: false },
  { key: "guest_room", name: "Guest Room", on: false },
];

export function emptyWizardData(firstName = "", lastName = "", currentZip = ""): WizardData {
  return {
    firstName,
    lastName,
    currentZip,
    serviceInterests: [],
    appOnlyIntent: false,
    timelineType: null,
    timelineValue: "",
    destinationType: null,
    destinationZip: "",
    destinationCommunity: "",
    destinationCommunityName: "",
    destinationCommunityOther: "",
    communityReferred: null,
    sqftRange: null,
    sqftExact: null,
    homeDensity: null,
    bedrooms: 1,
    bathrooms: 1,
    spaces: DEFAULT_SPACES.map(s => ({ ...s })),
    howHeard: "",
    howHeardDetail: "",
    referralPartnerId: "",
  };
}
