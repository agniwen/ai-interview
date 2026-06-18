import {
  ActivityIcon as ActivitySvg,
  AddIcon as PlusSvg,
  Alert02Icon as AlertTriangleSvg,
  AlertCircleIcon as AlertCircleSvg,
  ArrowDownIcon as ArrowDownSvg,
  ArrowLeftIcon as ArrowLeftSvg,
  ArrowRightIcon as ArrowRightSvg,
  ArrowUpDownIcon as ArrowUpDownSvg,
  ArrowUpIcon as ArrowUpSvg,
  ArrowUpRightIcon as ArrowUpRightSvg,
  Attachment01Icon as AttachmentSvg,
  AudioLinesIcon as AudioLinesSvg,
  BanIcon as BanSvg,
  BellIcon as BellSvg,
  BoldIcon as BoldSvg,
  BookIcon as BookSvg,
  BotIcon as BotSvg,
  BrainIcon as BrainSvg,
  BriefcaseBusinessIcon as BriefcaseBusinessSvg,
  BriefcaseIcon as BriefcaseSvg,
  Building2Icon as Building2Svg,
  CalendarClockIcon as CalendarClockSvg,
  CalendarDaysIcon as CalendarDaysSvg,
  CalendarIcon as CalendarSvg,
  Cancel01Icon as XSvg,
  CancelCircleIcon as XCircleSvg,
  ChartNoAxesCombinedIcon as ChartNoAxesCombinedSvg,
  CheckIcon as CheckSvg,
  CheckListIcon as ListChecksSvg,
  CheckmarkCircleIcon as CheckCircleSvg,
  CheckmarkSquareIcon as CheckSquareSvg,
  ChevronDownIcon as ChevronDownSvg,
  ChevronLeftIcon as ChevronLeftSvg,
  ChevronRightIcon as ChevronRightSvg,
  ChevronsLeftIcon as ChevronsLeftSvg,
  ChevronsRightIcon as ChevronsRightSvg,
  ChevronUpIcon as ChevronUpSvg,
  CircleCheckIcon as CircleCheckSvg,
  CircleDotIcon as CircleDotSvg,
  CircleIcon as CircleSvg,
  CircleSlash2Icon as CircleSlashSvg,
  ClipboardListIcon as ClipboardListSvg,
  ClockIcon as ClockSvg,
  CloudUploadIcon as UploadCloudSvg,
  CodeIcon as CodeSvg,
  ComputerArrowUpIcon as MonitorUpSvg,
  ComputerIcon as MonitorSvg,
  CopyIcon as CopySvg,
  CornerDownLeftIcon as CornerDownLeftSvg,
  CpuIcon as CpuSvg,
  DatabaseIcon as DatabaseSvg,
  Delete02Icon as TrashSvg,
  DownloadIcon as DownloadSvg,
  ExternalLinkIcon as ExternalLinkSvg,
  EyeIcon as EyeSvg,
  FastForwardIcon as SkipForwardSvg,
  File01Icon as FileTextSvg,
  FileSearchIcon as FileSearchSvg,
  FileUpIcon as FileUpSvg,
  FilterRemoveIcon as FilterXSvg,
  FolderGitTwoIcon as FolderGit2Svg,
  GaugeIcon as GaugeSvg,
  GlobeIcon as GlobeSvg,
  GraduationCapIcon as GraduationCapSvg,
  GripVerticalIcon as GripVerticalSvg,
  HandshakeIcon as HandshakeSvg,
  Heading03Icon as Heading3Svg,
  Heading1Icon as Heading1Svg,
  Heading2Icon as Heading2Svg,
  HelpCircleIcon as CircleHelpSvg,
  HistoryIcon as HistorySvg,
  HouseIcon as HouseSvg,
  ImageIcon as ImageSvg,
  ImageNotFoundIcon as ImageOffSvg,
  InboxIcon as InboxSvg,
  InfinityIcon as InfinitySvg,
  InformationCircleIcon as InfoSvg,
  LayoutGridIcon as LayoutGridSvg,
  LeftToRightListBulletIcon as ListSvg,
  LeftToRightListNumberIcon as ListOrderedSvg,
  LinkIcon as LinkSvg,
  ListChevronsDownUpIcon as ChevronsUpDownSvg,
  Loading03Icon as LoaderSvg,
  LockIcon as LockSvg,
  Login01Icon as LogInSvg,
  Logout01Icon as LogOutSvg,
  MagicWandIcon as WandSparklesSvg,
  MailIcon as MailSvg,
  MailValidationIcon as MailCheckSvg,
  Message02Icon as MessageSquareTextSvg,
  MicIcon as MicSvg,
  MicOffIcon as MicOffSvg,
  MinusSignIcon as MinusSvg,
  MonitorStopIcon as MonitorOffSvg,
  MoonIcon as MoonSvg,
  MoreHorizontalIcon as MoreHorizontalSvg,
  MusicNote01Icon as Music2Svg,
  OctagonXIcon as OctagonXSvg,
  PanelLeftIcon as PanelLeftSvg,
  PauseCircleIcon as OctagonPauseSvg,
  PencilIcon as PencilSvg,
  PhoneOffIcon as PhoneOffSvg,
  PlayIcon as PlaySvg,
  QrCodeIcon as QrCodeSvg,
  RadioIcon as RadioSvg,
  RedoIcon as RedoSvg,
  RefreshIcon as RefreshSvg,
  RotateLeftIcon as RotateCcwSvg,
  RulerIcon as RulerSvg,
  SaveIcon as SaveSvg,
  SearchIcon as SearchSvg,
  SecurityCheckIcon as ShieldCheckSvg,
  SentIcon as SendSvg,
  ServerStackIcon as ServerSvg,
  Settings02Icon as Settings2Svg,
  SettingsIcon as SettingsSvg,
  ShieldIcon as ShieldSvg,
  SparklesIcon as SparklesSvg,
  SquareIcon as SquareSvg,
  StopCircleIcon as CircleStopSvg,
  SunIcon as SunSvg,
  TargetIcon as TargetSvg,
  TextIcon as TypeSvg,
  TextItalicIcon as ItalicSvg,
  TimerIcon as TimerSvg,
  UndoIcon as UndoSvg,
  UploadIcon as UploadSvg,
  UserAddIcon as UserPlusSvg,
  UserCheckIcon as UserCheckSvg,
  UserCircleIcon as UserCircleSvg,
  UserIcon as UserSvg,
  UserMultipleIcon as UsersSvg,
  UserSettingsIcon as UserCogSvg,
  VideoIcon as VideoSvg,
  VideoOffIcon as VideoOffSvg,
  VolumeHighIcon as Volume2Svg,
  WifiIcon as WifiSvg,
  WrenchIcon as WrenchSvg,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { forwardRef } from "react";
import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  absoluteStrokeWidth?: boolean;
  disableSecondaryOpacity?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  showAlt?: boolean;
  size?: string | number;
};

export type LucideIcon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

function createHugeIcon(icon: IconSvgElement): LucideIcon {
  const Component = forwardRef<SVGSVGElement, IconProps>(({ strokeWidth, ...props }, ref) => {
    const parsedStrokeWidth =
      typeof strokeWidth === "string" ? Number.parseFloat(strokeWidth) : strokeWidth;

    return (
      <HugeiconsIcon
        icon={icon}
        ref={ref}
        strokeWidth={Number.isNaN(parsedStrokeWidth) ? undefined : parsedStrokeWidth}
        {...props}
      />
    );
  });
  Component.displayName = "HugeiconsCompatIcon";
  return Component;
}

const SelectChevronDownSvg = [
  [
    "path",
    {
      d: "m6 9 6 6 6-6",
      key: "0",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
    },
  ],
] as const;

const SelectChevronsUpDownSvg = [
  [
    "path",
    {
      d: "m7 15 5 5 5-5",
      key: "0",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
    },
  ],
  [
    "path",
    {
      d: "m7 9 5-5 5 5",
      key: "1",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: "2",
    },
  ],
] as const;

export const ActivityIcon = createHugeIcon(ActivitySvg as IconSvgElement);
export const AlertCircleIcon = createHugeIcon(AlertCircleSvg as IconSvgElement);
export const AlertTriangleIcon = createHugeIcon(AlertTriangleSvg as IconSvgElement);
export const ArrowDownIcon = createHugeIcon(ArrowDownSvg as IconSvgElement);
export const ArrowLeftIcon = createHugeIcon(ArrowLeftSvg as IconSvgElement);
export const ArrowRightIcon = createHugeIcon(ArrowRightSvg as IconSvgElement);
export const ArrowUpDownIcon = createHugeIcon(ArrowUpDownSvg as IconSvgElement);
export const ArrowUpIcon = createHugeIcon(ArrowUpSvg as IconSvgElement);
export const ArrowUpRightIcon = createHugeIcon(ArrowUpRightSvg as IconSvgElement);
export const AudioLinesIcon = createHugeIcon(AudioLinesSvg as IconSvgElement);
export const BanIcon = createHugeIcon(BanSvg as IconSvgElement);
export const BellIcon = createHugeIcon(BellSvg as IconSvgElement);
export const BoldIcon = createHugeIcon(BoldSvg as IconSvgElement);
export const BookIcon = createHugeIcon(BookSvg as IconSvgElement);
export const BotIcon = createHugeIcon(BotSvg as IconSvgElement);
export const BrainIcon = createHugeIcon(BrainSvg as IconSvgElement);
export const BriefcaseBusinessIcon = createHugeIcon(BriefcaseBusinessSvg as IconSvgElement);
export const BriefcaseIcon = createHugeIcon(BriefcaseSvg as IconSvgElement);
export const Building2Icon = createHugeIcon(Building2Svg as IconSvgElement);
export const CalendarClockIcon = createHugeIcon(CalendarClockSvg as IconSvgElement);
export const CalendarDaysIcon = createHugeIcon(CalendarDaysSvg as IconSvgElement);
export const CalendarIcon = createHugeIcon(CalendarSvg as IconSvgElement);
export const ChartNoAxesCombinedIcon = createHugeIcon(ChartNoAxesCombinedSvg as IconSvgElement);
export const CheckIcon = createHugeIcon(CheckSvg as IconSvgElement);
export const CheckCircle2Icon = createHugeIcon(CheckCircleSvg as IconSvgElement);
export const CheckCircleIcon = createHugeIcon(CheckCircleSvg as IconSvgElement);
export const CheckSquareIcon = createHugeIcon(CheckSquareSvg as IconSvgElement);
export const ChevronDownIcon = createHugeIcon(ChevronDownSvg as IconSvgElement);
export const ChevronLeftIcon = createHugeIcon(ChevronLeftSvg as IconSvgElement);
export const ChevronRightIcon = createHugeIcon(ChevronRightSvg as IconSvgElement);
export const ChevronUpIcon = createHugeIcon(ChevronUpSvg as IconSvgElement);
export const ChevronsLeftIcon = createHugeIcon(ChevronsLeftSvg as IconSvgElement);
export const ChevronsRightIcon = createHugeIcon(ChevronsRightSvg as IconSvgElement);
export const ChevronsUpDownIcon = createHugeIcon(ChevronsUpDownSvg as IconSvgElement);
export const CircleCheckIcon = createHugeIcon(CircleCheckSvg as IconSvgElement);
export const CircleDotIcon = createHugeIcon(CircleDotSvg as IconSvgElement);
export const CircleHelpIcon = createHugeIcon(CircleHelpSvg as IconSvgElement);
export const CircleIcon = createHugeIcon(CircleSvg as IconSvgElement);
export const CircleSlashIcon = createHugeIcon(CircleSlashSvg as IconSvgElement);
export const CircleStopIcon = createHugeIcon(CircleStopSvg as IconSvgElement);
export const ClipboardListIcon = createHugeIcon(ClipboardListSvg as IconSvgElement);
export const ClockIcon = createHugeIcon(ClockSvg as IconSvgElement);
export const CodeIcon = createHugeIcon(CodeSvg as IconSvgElement);
export const CopyIcon = createHugeIcon(CopySvg as IconSvgElement);
export const CornerDownLeftIcon = createHugeIcon(CornerDownLeftSvg as IconSvgElement);
export const CpuIcon = createHugeIcon(CpuSvg as IconSvgElement);
export const DatabaseIcon = createHugeIcon(DatabaseSvg as IconSvgElement);
export const DownloadIcon = createHugeIcon(DownloadSvg as IconSvgElement);
export const ExternalLinkIcon = createHugeIcon(ExternalLinkSvg as IconSvgElement);
export const EyeIcon = createHugeIcon(EyeSvg as IconSvgElement);
export const FileSearchIcon = createHugeIcon(FileSearchSvg as IconSvgElement);
export const FileTextIcon = createHugeIcon(FileTextSvg as IconSvgElement);
export const FileUpIcon = createHugeIcon(FileUpSvg as IconSvgElement);
export const FilterXIcon = createHugeIcon(FilterXSvg as IconSvgElement);
export const FolderGit2Icon = createHugeIcon(FolderGit2Svg as IconSvgElement);
export const GaugeIcon = createHugeIcon(GaugeSvg as IconSvgElement);
export const GlobeIcon = createHugeIcon(GlobeSvg as IconSvgElement);
export const GraduationCapIcon = createHugeIcon(GraduationCapSvg as IconSvgElement);
export const GripVerticalIcon = createHugeIcon(GripVerticalSvg as IconSvgElement);
export const HandshakeIcon = createHugeIcon(HandshakeSvg as IconSvgElement);
export const Heading1Icon = createHugeIcon(Heading1Svg as IconSvgElement);
export const Heading2Icon = createHugeIcon(Heading2Svg as IconSvgElement);
export const Heading3Icon = createHugeIcon(Heading3Svg as IconSvgElement);
export const HistoryIcon = createHugeIcon(HistorySvg as IconSvgElement);
export const HouseIcon = createHugeIcon(HouseSvg as IconSvgElement);
export const ImageIcon = createHugeIcon(ImageSvg as IconSvgElement);
export const ImageOffIcon = createHugeIcon(ImageOffSvg as IconSvgElement);
export const InboxIcon = createHugeIcon(InboxSvg as IconSvgElement);
export const InfinityIcon = createHugeIcon(InfinitySvg as IconSvgElement);
export const InfoIcon = createHugeIcon(InfoSvg as IconSvgElement);
export const ItalicIcon = createHugeIcon(ItalicSvg as IconSvgElement);
export const LayoutGridIcon = createHugeIcon(LayoutGridSvg as IconSvgElement);
export const LinkIcon = createHugeIcon(LinkSvg as IconSvgElement);
export const ListChecksIcon = createHugeIcon(ListChecksSvg as IconSvgElement);
export const ListIcon = createHugeIcon(ListSvg as IconSvgElement);
export const ListOrderedIcon = createHugeIcon(ListOrderedSvg as IconSvgElement);
export const Loader2Icon = createHugeIcon(LoaderSvg as IconSvgElement);
export const LoaderCircleIcon = createHugeIcon(LoaderSvg as IconSvgElement);
export const LoaderIcon = createHugeIcon(LoaderSvg as IconSvgElement);
export const LockIcon = createHugeIcon(LockSvg as IconSvgElement);
export const LogInIcon = createHugeIcon(LogInSvg as IconSvgElement);
export const LogOutIcon = createHugeIcon(LogOutSvg as IconSvgElement);
export const MailCheckIcon = createHugeIcon(MailCheckSvg as IconSvgElement);
export const MailIcon = createHugeIcon(MailSvg as IconSvgElement);
export const MessageSquareTextIcon = createHugeIcon(MessageSquareTextSvg as IconSvgElement);
export const MicIcon = createHugeIcon(MicSvg as IconSvgElement);
export const MicOffIcon = createHugeIcon(MicOffSvg as IconSvgElement);
export const MinusIcon = createHugeIcon(MinusSvg as IconSvgElement);
export const MonitorIcon = createHugeIcon(MonitorSvg as IconSvgElement);
export const MonitorOffIcon = createHugeIcon(MonitorOffSvg as IconSvgElement);
export const MonitorUpIcon = createHugeIcon(MonitorUpSvg as IconSvgElement);
export const MoonIcon = createHugeIcon(MoonSvg as IconSvgElement);
export const MoreHorizontalIcon = createHugeIcon(MoreHorizontalSvg as IconSvgElement);
export const Music2Icon = createHugeIcon(Music2Svg as IconSvgElement);
export const OctagonPauseIcon = createHugeIcon(OctagonPauseSvg as IconSvgElement);
export const OctagonXIcon = createHugeIcon(OctagonXSvg as IconSvgElement);
export const PanelLeftIcon = createHugeIcon(PanelLeftSvg as IconSvgElement);
export const PaperclipIcon = createHugeIcon(AttachmentSvg as IconSvgElement);
export const PencilIcon = createHugeIcon(PencilSvg as IconSvgElement);
export const PhoneOffIcon = createHugeIcon(PhoneOffSvg as IconSvgElement);
export const PlayIcon = createHugeIcon(PlaySvg as IconSvgElement);
export const PlusIcon = createHugeIcon(PlusSvg as IconSvgElement);
export const QrCodeIcon = createHugeIcon(QrCodeSvg as IconSvgElement);
export const RadioIcon = createHugeIcon(RadioSvg as IconSvgElement);
export const RedoIcon = createHugeIcon(RedoSvg as IconSvgElement);
export const RefreshCcwIcon = createHugeIcon(RefreshSvg as IconSvgElement);
export const RefreshCwIcon = createHugeIcon(RefreshSvg as IconSvgElement);
export const RotateCcwIcon = createHugeIcon(RotateCcwSvg as IconSvgElement);
export const RulerIcon = createHugeIcon(RulerSvg as IconSvgElement);
export const SaveIcon = createHugeIcon(SaveSvg as IconSvgElement);
export const SearchIcon = createHugeIcon(SearchSvg as IconSvgElement);
export const SendIcon = createHugeIcon(SendSvg as IconSvgElement);
export const ServerIcon = createHugeIcon(ServerSvg as IconSvgElement);
export const SelectChevronDownIcon = createHugeIcon(SelectChevronDownSvg as IconSvgElement);
export const SelectChevronsUpDownIcon = createHugeIcon(SelectChevronsUpDownSvg as IconSvgElement);
export const Settings2Icon = createHugeIcon(Settings2Svg as IconSvgElement);
export const SettingsIcon = createHugeIcon(SettingsSvg as IconSvgElement);
export const ShieldCheckIcon = createHugeIcon(ShieldCheckSvg as IconSvgElement);
export const ShieldIcon = createHugeIcon(ShieldSvg as IconSvgElement);
export const SkipForwardIcon = createHugeIcon(SkipForwardSvg as IconSvgElement);
export const SparklesIcon = createHugeIcon(SparklesSvg as IconSvgElement);
export const SquareCheckBigIcon = createHugeIcon(CheckSquareSvg as IconSvgElement);
export const SquareIcon = createHugeIcon(SquareSvg as IconSvgElement);
export const SunIcon = createHugeIcon(SunSvg as IconSvgElement);
export const TargetIcon = createHugeIcon(TargetSvg as IconSvgElement);
export const TimerIcon = createHugeIcon(TimerSvg as IconSvgElement);
export const Trash2Icon = createHugeIcon(TrashSvg as IconSvgElement);
export const TriangleAlertIcon = createHugeIcon(AlertTriangleSvg as IconSvgElement);
export const TypeIcon = createHugeIcon(TypeSvg as IconSvgElement);
export const UndoIcon = createHugeIcon(UndoSvg as IconSvgElement);
export const UploadCloudIcon = createHugeIcon(UploadCloudSvg as IconSvgElement);
export const UploadIcon = createHugeIcon(UploadSvg as IconSvgElement);
export const UserCheckIcon = createHugeIcon(UserCheckSvg as IconSvgElement);
export const UserCircleIcon = createHugeIcon(UserCircleSvg as IconSvgElement);
export const UserCogIcon = createHugeIcon(UserCogSvg as IconSvgElement);
export const UserIcon = createHugeIcon(UserSvg as IconSvgElement);
export const UserPlusIcon = createHugeIcon(UserPlusSvg as IconSvgElement);
export const UserRoundIcon = createHugeIcon(UserCircleSvg as IconSvgElement);
export const UsersIcon = createHugeIcon(UsersSvg as IconSvgElement);
export const VideoIcon = createHugeIcon(VideoSvg as IconSvgElement);
export const VideoOffIcon = createHugeIcon(VideoOffSvg as IconSvgElement);
export const Volume2Icon = createHugeIcon(Volume2Svg as IconSvgElement);
export const WandSparklesIcon = createHugeIcon(WandSparklesSvg as IconSvgElement);
export const WifiIcon = createHugeIcon(WifiSvg as IconSvgElement);
export const WrenchIcon = createHugeIcon(WrenchSvg as IconSvgElement);
export const XCircleIcon = createHugeIcon(XCircleSvg as IconSvgElement);
export const XIcon = createHugeIcon(XSvg as IconSvgElement);

export const ArrowLeft = ArrowLeftIcon;
export const ArrowRight = ArrowRightIcon;
export const Brain = BrainIcon;
export const Check = CheckIcon;
export const ChevronRight = ChevronRightIcon;
export const ChevronsUpDown = ChevronsUpDownIcon;
export const CircleX = XCircleIcon;
export const Loader = LoaderIcon;
export const Loader2 = Loader2Icon;
export const Mic = MicIcon;
export const MicOff = MicOffIcon;
export const Minus = MinusIcon;
export const MoreHorizontal = MoreHorizontalIcon;
export const OctagonPause = OctagonPauseIcon;
export const Plus = PlusIcon;
export const SendHorizontal = SendIcon;
