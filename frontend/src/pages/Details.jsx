/**
 * Details.jsx — Generic Details Page
 *
 * Placeholder page for showing item-specific details.
 * Currently renders a simple heading and description.
 * May be used as a fallback or for future expansion.
 */

import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * Details — Generic details page component.
 * Renders within DashboardLayout with a static message.
 */
function Details() {
  const { t } = useTranslation();
  return (
    <DashboardLayout>
      <div>
        <h1>{t("Details", { defaultValue: "Details" })}</h1>
        <p>{t("Review detailed project and task information from this page.", { defaultValue: "Review detailed project and task information from this page." })}</p>
      </div>
    </DashboardLayout>
  );
}

export default Details;
