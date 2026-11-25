import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";
import { Spinner } from "@/components/ui";
import { RedirectIfAuthed, RequireAuth } from "@/features/auth/guards";
import { NotFoundPage, PrivacyPage, TermsPage } from "./pages";
import { AppShell } from "./shell/AppShell";

const LandingPage = lazy(() => import("@/features/landing/pages/LandingPage"));
const SignInPage = lazy(() => import("@/features/auth/pages/SignInPage"));
const SignUpPage = lazy(() => import("@/features/auth/pages/SignUpPage"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/features/auth/pages/ResetPasswordPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/DashboardPage"));
const BookletLayout = lazy(() => import("@/features/booklet/BookletLayout"));
const SnippetListPage = lazy(() => import("@/features/booklet/SnippetListPage"));
const SubjectsPage = lazy(() => import("@/features/booklet/SubjectsPage"));
const SubjectDetailPage = lazy(() => import("@/features/booklet/SubjectDetailPage"));
const CollectionsPage = lazy(() => import("@/features/booklet/CollectionsPage"));
const SnippetEditorPage = lazy(() => import("@/features/booklet/SnippetEditorPage"));
const SnippetViewPage = lazy(() => import("@/features/booklet/SnippetViewPage"));
const GeneratePage = lazy(() => import("@/features/practice/GeneratePage"));
const QuizPlayerPage = lazy(() => import("@/features/practice/QuizPlayerPage"));
const QuizzesPage = lazy(() => import("@/features/practice/QuizzesPage").then((m) => ({ default: m.QuizzesPage })));
const QuizDetailPage = lazy(() => import("@/features/practice/QuizzesPage").then((m) => ({ default: m.QuizDetailPage })));
const HistoryPage = lazy(() => import("@/features/practice/QuizzesPage").then((m) => ({ default: m.HistoryPage })));
const RevisionPage = lazy(() => import("@/features/revision/RevisionPage"));
const LibraryLayout = lazy(() => import("@/features/questions/LibraryLayout"));
const QuestionListPage = lazy(() => import("@/features/questions/QuestionListPage"));
const IncorrectPage = lazy(() => import("@/features/questions/IncorrectPage"));
const QuestionDetailPage = lazy(() => import("@/features/questions/QuestionDetailPage"));
const QuestionEditorPage = lazy(() => import("@/features/questions/QuestionEditorPage"));
/** Lazy-load a named export as a page component. */
const named = <T,>(p: Promise<T>, k: keyof T) => p.then((m) => ({ default: m[k] as unknown as ComponentType }));
const plannerPages = () => import("@/features/planner/PlannerPages");
const schedulePages = () => import("@/features/planner/SchedulePages");
const PlannerOverviewPage = lazy(() => named(plannerPages(), "PlannerOverviewPage"));
const GoalsPage = lazy(() => named(plannerPages(), "GoalsPage"));
const GoalDetailPage = lazy(() => named(plannerPages(), "GoalDetailPage"));
const DayPlanPage = lazy(() => named(schedulePages(), "DayPlanPage"));
const WeekPlanPage = lazy(() => named(schedulePages(), "WeekPlanPage"));
const FocusPage = lazy(() => named(schedulePages(), "FocusPage"));
const SessionDetailPage = lazy(() => named(schedulePages(), "SessionDetailPage"));
const papersPages = () => import("@/features/papers/PapersPages");
const PapersListPage = lazy(() => named(papersPages(), "PapersListPage"));
const NewPaperPage = lazy(() => named(papersPages(), "NewPaperPage"));
const MaterialsPage = lazy(() => named(papersPages(), "MaterialsPage"));
const PaperAttemptsPage = lazy(() => named(papersPages(), "PaperAttemptsPage"));
const PaperDetailPage = lazy(() => named(papersPages(), "PaperDetailPage"));
const PaperAttemptPage = lazy(() => import("@/features/papers/PaperAttemptPage"));
const analytics = () => import("@/features/analytics/AnalyticsPages");
const OverallPage = lazy(() => named(analytics(), "OverallPage"));
const SubjectsAnalyticsPage = lazy(() => named(analytics(), "SubjectsAnalyticsPage"));
const CodingAnalyticsPage = lazy(() => named(analytics(), "CodingAnalyticsPage"));
const RevisionAnalyticsPage = lazy(() => named(analytics(), "RevisionAnalyticsPage"));
const StudyTimePage = lazy(() => named(analytics(), "StudyTimePage"));
const settings = () => import("@/features/settings/SettingsPages");
const ProfileSettings = lazy(() => named(settings(), "ProfileSettings"));
const AccountSettings = lazy(() => named(settings(), "AccountSettings"));
const AiSettings = lazy(() => named(settings(), "AiSettings"));
const LearningSettings = lazy(() => named(settings(), "LearningSettings"));
const NotificationSettings = lazy(() => named(settings(), "NotificationSettings"));
const AppearanceSettings = lazy(() => named(settings(), "AppearanceSettings"));
const DataSettings = lazy(() => named(settings(), "DataSettings"));
const CalendarPage = lazy(() => import("@/features/calendar/CalendarPage"));
const DesignSystemPage = lazy(() => import("@/features/system/DesignSystemPage"));

function Lazy({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

const guest = (page: ReactNode) => (
  <RedirectIfAuthed>
    <Lazy>{page}</Lazy>
  </RedirectIfAuthed>
);
const page = (el: ReactNode) => <Lazy>{el}</Lazy>;

const appRoutes: RouteObject[] = [
  { index: true, element: page(<DashboardPage />) },
  {
    path: "booklet",
    element: page(<BookletLayout />),
    children: [
      { index: true, element: page(<SnippetListPage />) },
      { path: "favourites", element: page(<SnippetListPage variant="favourites" />) },
      { path: "recent", element: page(<SnippetListPage variant="recent" />) },
      { path: "subjects", element: page(<SubjectsPage />) },
      { path: "subjects/:id", element: page(<SubjectDetailPage />) },
      { path: "collections", element: page(<CollectionsPage />) },
    ],
  },
  { path: "booklet/new", element: page(<SnippetEditorPage />) },
  { path: "booklet/snippets/:id", element: page(<SnippetViewPage />) },
  { path: "booklet/snippets/:id/edit", element: page(<SnippetEditorPage />) },
  { path: "practice", element: page(<GeneratePage />) },
  { path: "practice/short", element: page(<GeneratePage initialMode="SHORT" />) },
  { path: "practice/long", element: page(<GeneratePage initialMode="LONG" />) },
  { path: "practice/quizzes", element: page(<QuizzesPage />) },
  { path: "practice/quizzes/:id", element: page(<QuizDetailPage />) },
  { path: "practice/history", element: page(<HistoryPage />) },
  { path: "practice/attempts/:id", element: page(<QuizPlayerPage />) },
  { path: "revision", element: page(<RevisionPage />) },
  {
    path: "library",
    element: page(<LibraryLayout />),
    children: [
      { index: true, element: page(<QuestionListPage />) },
      { path: "marked/green", element: page(<QuestionListPage variant="green" />) },
      { path: "marked/yellow", element: page(<QuestionListPage variant="yellow" />) },
      { path: "marked/red", element: page(<QuestionListPage variant="red" />) },
      { path: "favourites", element: page(<QuestionListPage variant="favourites" />) },
      { path: "imported", element: page(<QuestionListPage variant="imported" />) },
      { path: "incorrect", element: page(<IncorrectPage />) },
    ],
  },
  { path: "library/new", element: page(<QuestionEditorPage />) },
  { path: "library/questions/:id", element: page(<QuestionDetailPage />) },
  { path: "library/questions/:id/edit", element: page(<QuestionEditorPage />) },
  { path: "papers", element: page(<PapersListPage />) },
  { path: "papers/new", element: page(<NewPaperPage />) },
  { path: "papers/materials", element: page(<MaterialsPage />) },
  { path: "papers/attempts", element: page(<PaperAttemptsPage />) },
  { path: "papers/attempts/:id", element: page(<PaperAttemptPage />) },
  { path: "papers/:id", element: page(<PaperDetailPage />) },
  { path: "planner", element: page(<PlannerOverviewPage />) },
  { path: "planner/goals", element: page(<GoalsPage />) },
  { path: "planner/goals/:id", element: page(<GoalDetailPage />) },
  { path: "planner/day", element: page(<DayPlanPage />) },
  { path: "planner/week", element: page(<WeekPlanPage />) },
  { path: "planner/focus", element: page(<FocusPage />) },
  { path: "planner/sessions/:id", element: page(<SessionDetailPage />) },
  { path: "calendar", element: page(<CalendarPage />) },
  { path: "analytics", element: page(<OverallPage />) },
  { path: "analytics/subjects", element: page(<SubjectsAnalyticsPage />) },
  { path: "analytics/coding", element: page(<CodingAnalyticsPage />) },
  { path: "analytics/revision", element: page(<RevisionAnalyticsPage />) },
  { path: "analytics/study-time", element: page(<StudyTimePage />) },
  { path: "settings", element: page(<ProfileSettings />) },
  { path: "settings/account", element: page(<AccountSettings />) },
  { path: "settings/ai", element: page(<AiSettings />) },
  { path: "settings/learning", element: page(<LearningSettings />) },
  { path: "settings/notifications", element: page(<NotificationSettings />) },
  { path: "settings/appearance", element: page(<AppearanceSettings />) },
  { path: "settings/data", element: page(<DataSettings />) },
  { path: "*", element: <NotFoundPage /> },
];

const routes: RouteObject[] = [
  { path: "/", element: page(<LandingPage />) },
  { path: "/signin", element: guest(<SignInPage />) },
  { path: "/signup", element: guest(<SignUpPage />) },
  { path: "/forgot-password", element: guest(<ForgotPasswordPage />) },
  // Not guest-only: a signed-in user may open a reset link from their email.
  { path: "/reset-password", element: page(<ResetPasswordPage />) },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: appRoutes,
  },
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  ...(import.meta.env.DEV ? [{ path: "/design-system", element: page(<DesignSystemPage />) }] : []),
  { path: "*", element: <NotFoundPage /> },
];

export const router = createBrowserRouter(routes);
