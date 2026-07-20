/**
 * RowActions.jsx
 * Reusable action bar for table rows. Buttons hidden by default, shown on row hover.
 */

import "./RowActions.css";

const RowActions = ({ children }) => {
  return (
    <div className="row-actions">
      {children}
    </div>
  );
};

export default RowActions;
