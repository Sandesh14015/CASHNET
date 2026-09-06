"""
Comprehensive Data Visualization Suite for CASHNET Analysis
Generates heatmaps, correlation matrices, and KDE plots with high-resolution output
"""

import json
import logging
import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

# Suppress warnings for cleaner output
warnings.filterwarnings("ignore")

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ROOT = Path(__file__).parent
IMAGES_DIR = PROJECT_ROOT / "images"
DATA_DIR = PROJECT_ROOT / "182" / "DATA"
DPI = 300  # High resolution
FIGURE_FORMAT = "png"

# Ensure images directory exists
IMAGES_DIR.mkdir(exist_ok=True, parents=True)
logger.info(f"Images directory ready: {IMAGES_DIR}")

# Set style for all plots
plt.style.use("seaborn-v0_8-darkgrid")
sns.set_palette("husl")


def load_json_batch_files(batch_dir):
    """
    Load all JSON batch files from a directory and combine them into a dataframe
    """
    all_data = []
    batch_dir = Path(batch_dir)

    if not batch_dir.exists():
        logger.warning(f"Directory not found: {batch_dir}")
        return pd.DataFrame()

    for batch_file in sorted(batch_dir.glob("batch_*.json")):
        try:
            with open(batch_file, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    all_data.extend(data)
                else:
                    all_data.append(data)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Error loading {batch_file}: {e}")

    return all_data


def flatten_json_data(json_list, case_type=None):
    """
    Flatten nested JSON data into a pandas-friendly format
    """
    flattened = []

    for item in json_list:
        flat_item = {}

        # Extract top-level fields
        flat_item["sahyog_case_id"] = item.get("sahyog_case_id", "")
        flat_item["case_type"] = item.get("case_type", case_type)
        flat_item["case_status"] = item.get("case_status", "")
        flat_item["case_priority"] = item.get("case_priority", "")

        # Extract investigation details
        inv_details = item.get("investigation_details", {})
        flat_item["agency"] = inv_details.get("agency", "")

        # Extract target wallets info
        wallets = item.get("target_wallets", [])
        flat_item["num_target_wallets"] = len(wallets)

        if wallets:
            flat_item["target_blockchain"] = wallets[0].get("blockchain", "")
            flat_item["wallet_priority"] = wallets[0].get("priority", "")

        # Extract legal requests
        legal_requests = item.get("legal_requests_already_sent", [])
        flat_item["num_legal_requests"] = len(legal_requests)

        # Count requests by status
        if legal_requests:
            statuses = [req.get("status", "") for req in legal_requests]
            flat_item["legal_overdue_count"] = statuses.count("overdue")
            flat_item["legal_pending_count"] = statuses.count("pending")
            flat_item["legal_completed_count"] = statuses.count("completed")

        flattened.append(flat_item)

    return pd.DataFrame(flattened)


def create_numeric_feature_matrix(df):
    """
    Create a numeric feature matrix for correlation analysis
    """
    numeric_features = pd.DataFrame()

    # Encode categorical variables
    priority_map = {"CRITICAL": 5, "HIGH": 4, "MEDIUM": 3, "LOW": 2, "INFO": 1}

    numeric_features["case_priority_encoded"] = df["case_priority"].map(
        lambda x: priority_map.get(x, 0)
    )
    numeric_features["num_target_wallets"] = (
        df["num_target_wallets"].fillna(0).astype(int)
    )
    numeric_features["num_legal_requests"] = (
        df["num_legal_requests"].fillna(0).astype(int)
    )
    numeric_features["legal_overdue_count"] = (
        df["legal_overdue_count"].fillna(0).astype(int)
    )
    numeric_features["legal_pending_count"] = (
        df["legal_pending_count"].fillna(0).astype(int)
    )
    numeric_features["legal_completed_count"] = (
        df["legal_completed_count"].fillna(0).astype(int)
    )

    # Calculate case complexity score
    numeric_features["case_complexity"] = (
        numeric_features["num_target_wallets"]
        + numeric_features["num_legal_requests"]
        + numeric_features["legal_overdue_count"] * 2
    )

    return numeric_features.fillna(0)


def generate_correlation_heatmap(numeric_df, title, filename):
    """
    Generate a high-quality correlation heatmap
    """
    logger.info(f"Generating correlation heatmap: {filename}")

    _, ax = plt.subplots(figsize=(12, 10), dpi=DPI)

    # Calculate correlation matrix
    corr_matrix = numeric_df.corr()

    # Create heatmap
    mask = np.triu(np.ones_like(corr_matrix, dtype=bool), k=1)
    sns.heatmap(
        corr_matrix,
        mask=mask,
        annot=True,
        fmt=".2f",
        cmap="coolwarm",
        center=0,
        square=True,
        linewidths=1,
        cbar_kws={"shrink": 0.8},
        ax=ax,
        vmin=-1,
        vmax=1,
    )

    ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
    plt.xticks(rotation=45, ha="right")
    plt.yticks(rotation=0)
    plt.tight_layout()

    output_path = IMAGES_DIR / filename
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def generate_feature_heatmap(data_matrix, features, title, filename, cmap="YlOrRd"):
    """
    Generate a heatmap for feature values across categories
    """
    logger.info(f"Generating feature heatmap: {filename}")

    _, ax = plt.subplots(figsize=(14, 8), dpi=DPI)

    sns.heatmap(
        data_matrix,
        annot=True,
        fmt=".0f",
        cmap=cmap,
        cbar_kws={"label": "Count"},
        linewidths=0.5,
        ax=ax,
        xticklabels=features,
        yticklabels=data_matrix.index,
    )

    ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
    ax.set_xlabel("Features", fontsize=12)
    ax.set_ylabel("Categories", fontsize=12)
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    output_path = IMAGES_DIR / filename
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def generate_kde_plot(data, title, xlabel, filename, color="steelblue"):
    """
    Generate a Kernel Density Estimation plot
    """
    logger.info(f"Generating KDE plot: {filename}")

    # Remove NaN values
    data_clean = data.dropna()

    if len(data_clean) == 0:
        logger.warning(f"No data available for KDE plot: {filename}")
        return

    # Check if data has sufficient variance
    if data_clean.std() == 0:
        logger.warning(
            f"Data has no variance for KDE plot: {filename}. Creating histogram only."
        )
        _, ax = plt.subplots(figsize=(12, 7), dpi=DPI)
        ax.hist(data_clean, bins=10, alpha=0.6, color=color, edgecolor="black")
        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.set_xlabel(xlabel, fontsize=12)
        ax.set_ylabel("Count", fontsize=12)
        ax.grid(True, alpha=0.3)
    else:
        _, ax = plt.subplots(figsize=(12, 7), dpi=DPI)

        try:
            # Create KDE plot
            from scipy.stats import gaussian_kde

            kde = gaussian_kde(data_clean, bw_method="scott")
            x_range = np.linspace(
                data_clean.min() - data_clean.std(),
                data_clean.max() + data_clean.std(),
                200,
            )
            y_kde = kde(x_range)

            ax.plot(x_range, y_kde, linewidth=2.5, color=color)
            ax.fill_between(x_range, y_kde, alpha=0.3, color=color)

            # Add histogram overlay
            ax.hist(
                data_clean,
                bins=30,
                alpha=0.3,
                color=color,
                density=True,
                edgecolor="black",
            )
        except (ValueError, RuntimeError) as e:
            logger.warning(
                f"KDE calculation failed for {filename}: {e}. Using histogram only."
            )
            ax.hist(
                data_clean,
                bins=30,
                alpha=0.6,
                color=color,
                edgecolor="black",
                density=True,
            )

        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.set_xlabel(xlabel, fontsize=12)
        ax.set_ylabel("Density", fontsize=12)
        ax.grid(True, alpha=0.3)

    # Add statistics box
    stats_text = f"Mean: {data_clean.mean():.2f}\nStd: {data_clean.std():.2f}\nMin: {data_clean.min():.2f}\nMax: {data_clean.max():.2f}"
    ax.text(
        0.75,
        0.97,
        stats_text,
        transform=ax.transAxes,
        fontsize=10,
        verticalalignment="top",
        bbox={"boxstyle": "round", "facecolor": "wheat", "alpha": 0.5},
    )

    plt.tight_layout()

    output_path = IMAGES_DIR / filename
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def generate_multivariate_kde(df, features, title, filename):
    """
    Generate a 2D KDE plot for bivariate analysis
    """
    if len(features) != 2:
        logger.warning(
            f"Multivariate KDE requires exactly 2 features, got {len(features)}"
        )
        return

    logger.info(f"Generating 2D KDE plot: {filename}")

    x_data = df[features[0]].dropna()
    y_data = df[features[1]].dropna()

    # Align data
    valid_idx = x_data.index.intersection(y_data.index)
    x = x_data[valid_idx]
    y = y_data[valid_idx]

    if len(x) < 2 or len(y) < 2:
        logger.warning(f"Insufficient data for 2D KDE plot: {filename}")
        return

    # Check for sufficient variance
    if x.std() == 0 or y.std() == 0:
        logger.warning(
            f"Insufficient variance in one or both dimensions for 2D KDE: {filename}"
        )
        # Fall back to scatter plot
        _, ax = plt.subplots(figsize=(12, 9), dpi=DPI)
        ax.scatter(x, y, alpha=0.5, s=30, color="steelblue", edgecolors="darkblue")
        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.set_xlabel(features[0], fontsize=12)
        ax.set_ylabel(features[1], fontsize=12)
        ax.grid(True, alpha=0.3)
        plt.tight_layout()
        output_path = IMAGES_DIR / filename
        plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
        logger.info(f"Saved (scatter plot fallback): {output_path}")
        plt.close()
        return

    _, ax = plt.subplots(figsize=(12, 9), dpi=DPI)

    try:
        sns.kdeplot(x=x, y=y, ax=ax, cmap="viridis", fill=True, thresh=0, levels=15)

        # Overlay scatter plot
        ax.scatter(x, y, alpha=0.3, s=20, color="red", edgecolors="darkred")

        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.set_xlabel(features[0], fontsize=12)
        ax.set_ylabel(features[1], fontsize=12)
        ax.grid(True, alpha=0.3)

        plt.tight_layout()

        output_path = IMAGES_DIR / filename
        plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
        logger.info(f"Saved: {output_path}")
        plt.close()
    except (ValueError, RuntimeError) as e:
        logger.warning(
            f"KDE computation failed for {filename}: {e}. Using scatter plot."
        )
        _, ax = plt.subplots(figsize=(12, 9), dpi=DPI)
        ax.scatter(x, y, alpha=0.5, s=30, color="steelblue", edgecolors="darkblue")
        ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
        ax.set_xlabel(features[0], fontsize=12)
        ax.set_ylabel(features[1], fontsize=12)
        ax.grid(True, alpha=0.3)
        plt.tight_layout()
        output_path = IMAGES_DIR / filename
        plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
        logger.info(f"Saved (scatter plot fallback): {output_path}")
        plt.close()


def generate_distribution_comparison(data_dict, title, ylabel, filename):
    """
    Generate KDE plots comparing distributions across categories
    """
    logger.info(f"Generating distribution comparison: {filename}")

    _, ax = plt.subplots(figsize=(13, 8), dpi=DPI)

    colors = sns.color_palette("husl", len(data_dict))

    for (label, data), color in zip(data_dict.items(), colors, strict=False):
        data_clean = data.dropna()

        # Check if data has sufficient variance for KDE
        if len(data_clean) > 1 and data_clean.std() > 0:
            try:
                # Use histogram with KDE overlay for more robustness
                ax.hist(
                    data_clean,
                    bins=20,
                    alpha=0.3,
                    label=label,
                    color=color,
                    density=True,
                )

                # Try to add KDE curve
                from scipy.stats import gaussian_kde

                kde = gaussian_kde(data_clean, bw_method="scott")
                x_range = np.linspace(data_clean.min(), data_clean.max(), 100)
                ax.plot(x_range, kde(x_range), linewidth=2.5, color=color)
            except (ValueError, RuntimeError) as e:
                logger.warning(
                    f"Could not generate KDE for {label}: {e}. Using histogram only."
                )
                ax.hist(
                    data_clean,
                    bins=20,
                    alpha=0.3,
                    label=label,
                    color=color,
                    density=True,
                )
        elif len(data_clean) > 1:
            # Data has no variance, use histogram only
            logger.warning(f"Data for {label} has no variance, using histogram only")
            ax.hist(
                data_clean, bins=5, alpha=0.3, label=label, color=color, density=True
            )

    ax.set_title(title, fontsize=16, fontweight="bold", pad=20)
    ax.set_xlabel(ylabel, fontsize=12)
    ax.set_ylabel("Density", fontsize=12)
    ax.legend(loc="best", fontsize=10)
    ax.grid(True, alpha=0.3)

    plt.tight_layout()

    output_path = IMAGES_DIR / filename
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def generate_case_priority_heatmap(df):
    """
    Generate heatmap of case types vs priority levels
    """
    logger.info("Generating case priority heatmap")

    # Create cross-tabulation
    priority_case = pd.crosstab(df["case_type"], df["case_priority"], margins=True)
    priority_case = priority_case.drop("All")
    priority_case = priority_case.drop("All", axis=1)

    if priority_case.empty:
        logger.warning("No data for case priority heatmap")
        return

    _, ax = plt.subplots(figsize=(12, 8), dpi=DPI)

    sns.heatmap(
        priority_case,
        annot=True,
        fmt="d",
        cmap="RdYlGn_r",
        cbar_kws={"label": "Case Count"},
        linewidths=1,
        ax=ax,
    )

    ax.set_title("Case Types by Priority Level", fontsize=16, fontweight="bold", pad=20)
    ax.set_xlabel("Priority Level", fontsize=12)
    ax.set_ylabel("Case Type", fontsize=12)
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()

    output_path = IMAGES_DIR / "01_case_priority_heatmap.png"
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def generate_case_status_distribution(df):
    """
    Generate KDE plot for case status distribution
    """
    logger.info("Generating case status distribution")

    status_counts = df["case_status"].value_counts()

    if len(status_counts) == 0:
        logger.warning("No case status data")
        return

    _, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6), dpi=DPI)

    # Bar plot
    status_counts.plot(kind="barh", ax=ax1, color="steelblue")
    ax1.set_title("Case Status Distribution", fontsize=14, fontweight="bold")
    ax1.set_xlabel("Count", fontsize=11)
    ax1.set_ylabel("Status", fontsize=11)

    # Pie chart
    ax2.pie(
        status_counts.values,
        labels=status_counts.index,
        autopct="%1.1f%%",
        startangle=90,
        colors=sns.color_palette("husl", len(status_counts)),
    )
    ax2.set_title("Case Status Proportion", fontsize=14, fontweight="bold")

    plt.tight_layout()

    output_path = IMAGES_DIR / "02_case_status_distribution.png"
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()


def main():
    """
    Main function to orchestrate all visualizations
    """
    logger.info("=" * 80)
    logger.info("CASHNET Data Visualization Suite - Starting")
    logger.info("=" * 80)

    all_dfs = []
    case_categories = []

    # Load data from different case directories
    case_dirs = {
        "Crypto Investigation": DATA_DIR / "crypto_investigation_cases",
        "Cross Border": DATA_DIR / "cross_border_cases",
        "Ransomware": DATA_DIR / "ransomware_cases",
        "Legal Requests": DATA_DIR / "legal_requests",
    }

    for case_name, case_dir in case_dirs.items():
        logger.info(f"Loading {case_name} cases from {case_dir}")
        json_data = load_json_batch_files(case_dir)

        if json_data:
            df = flatten_json_data(json_data, case_type=case_name)
            all_dfs.append(df)
            case_categories.append(case_name)
            logger.info(f"Loaded {len(df)} records from {case_name}")
        else:
            logger.warning(f"No data found in {case_name}")

    if not all_dfs:
        logger.error("No data loaded from any case directory!")
        return

    # Combine all dataframes
    combined_df = pd.concat(all_dfs, ignore_index=True)
    logger.info(f"Total records loaded: {len(combined_df)}")

    # Create numeric feature matrix
    numeric_df = create_numeric_feature_matrix(combined_df)

    # === GENERATE VISUALIZATIONS ===

    # 1. Correlation Matrix Heatmap
    generate_correlation_heatmap(
        numeric_df,
        title="Feature Correlation Matrix - Case Analysis",
        filename="03_correlation_matrix.png",
    )

    # 2. Case Priority Heatmap
    generate_case_priority_heatmap(combined_df)

    # 3. Case Status Distribution
    generate_case_status_distribution(combined_df)

    # 4. Agency Heatmap
    if "agency" in combined_df.columns:
        agency_priority = pd.crosstab(
            combined_df["agency"], combined_df["case_priority"]
        )
        if not agency_priority.empty:
            generate_feature_heatmap(
                agency_priority,
                features=agency_priority.columns.tolist(),
                title="Agencies by Case Priority",
                filename="04_agency_priority_heatmap.png",
                cmap="Blues",
            )

    # 5. KDE: Number of Target Wallets
    generate_kde_plot(
        numeric_df["num_target_wallets"],
        title="Distribution of Target Wallets per Case",
        xlabel="Number of Target Wallets",
        filename="05_kde_target_wallets.png",
        color="steelblue",
    )

    # 6. KDE: Legal Requests Volume
    generate_kde_plot(
        numeric_df["num_legal_requests"],
        title="Distribution of Legal Requests per Case",
        xlabel="Number of Legal Requests",
        filename="06_kde_legal_requests.png",
        color="seagreen",
    )

    # 7. KDE: Case Complexity Score
    generate_kde_plot(
        numeric_df["case_complexity"],
        title="Distribution of Case Complexity Scores",
        xlabel="Complexity Score",
        filename="07_kde_case_complexity.png",
        color="coral",
    )

    # 8. KDE: Legal Overdue Requests
    generate_kde_plot(
        numeric_df["legal_overdue_count"],
        title="Distribution of Overdue Legal Requests",
        xlabel="Number of Overdue Requests",
        filename="08_kde_overdue_requests.png",
        color="crimson",
    )

    # 9. 2D KDE: Wallets vs Legal Requests
    generate_multivariate_kde(
        numeric_df,
        features=["num_target_wallets", "num_legal_requests"],
        title="2D KDE: Target Wallets vs Legal Requests",
        filename="09_kde_2d_wallets_requests.png",
    )

    # 10. 2D KDE: Legal Requests vs Overdue
    generate_multivariate_kde(
        numeric_df,
        features=["num_legal_requests", "legal_overdue_count"],
        title="2D KDE: Legal Requests vs Overdue Count",
        filename="10_kde_2d_requests_overdue.png",
    )

    # 11. Distribution Comparison by Case Type
    dist_by_type = {}
    for case_type in combined_df["case_type"].unique():
        if pd.notna(case_type):
            dist_by_type[case_type] = numeric_df[combined_df["case_type"] == case_type][
                "num_target_wallets"
            ]

    if dist_by_type:
        generate_distribution_comparison(
            dist_by_type,
            title="Target Wallets Distribution by Case Type",
            ylabel="Number of Target Wallets",
            filename="11_dist_comparison_wallets.png",
        )

    # 12. Distribution Comparison: Legal Requests by Case Type
    dist_legal_by_type = {}
    for case_type in combined_df["case_type"].unique():
        if pd.notna(case_type):
            dist_legal_by_type[case_type] = numeric_df[
                combined_df["case_type"] == case_type
            ]["num_legal_requests"]

    if dist_legal_by_type:
        generate_distribution_comparison(
            dist_legal_by_type,
            title="Legal Requests Distribution by Case Type",
            ylabel="Number of Legal Requests",
            filename="12_dist_comparison_legal_requests.png",
        )

    # 13. Priority Encoded Heatmap
    priority_status = pd.crosstab(
        combined_df["case_priority"], combined_df["case_status"], margins=True
    )
    priority_status = priority_status.drop("All")
    priority_status = priority_status.drop("All", axis=1)

    if not priority_status.empty:
        generate_feature_heatmap(
            priority_status,
            features=priority_status.columns.tolist(),
            title="Case Priority vs Status Matrix",
            filename="13_priority_status_heatmap.png",
            cmap="YlOrRd",
        )

    # 14. Statistical Summary Heatmap
    summary_stats = numeric_df[
        ["num_target_wallets", "num_legal_requests", "case_complexity"]
    ].describe()
    summary_stats = summary_stats.iloc[:5]  # Count, mean, std, min, max

    _, ax = plt.subplots(figsize=(10, 6), dpi=DPI)
    sns.heatmap(
        summary_stats,
        annot=True,
        fmt=".2f",
        cmap="coolwarm",
        cbar_kws={"label": "Value"},
        linewidths=1,
        ax=ax,
    )
    ax.set_title(
        "Statistical Summary of Key Metrics", fontsize=16, fontweight="bold", pad=20
    )
    plt.tight_layout()

    output_path = IMAGES_DIR / "14_statistical_summary_heatmap.png"
    plt.savefig(output_path, dpi=DPI, bbox_inches="tight", format=FIGURE_FORMAT)
    logger.info(f"Saved: {output_path}")
    plt.close()

    # === SUMMARY REPORT ===
    logger.info("=" * 80)
    logger.info("VISUALIZATION GENERATION COMPLETE")
    logger.info("=" * 80)
    logger.info("Total images generated: 14")
    logger.info(f"Output directory: {IMAGES_DIR}")
    logger.info(f"Total records analyzed: {len(combined_df)}")
    logger.info(f"Image format: {FIGURE_FORMAT.upper()} @ {DPI} DPI")

    # List all generated files
    generated_files = sorted(IMAGES_DIR.glob(f"*.{FIGURE_FORMAT}"))
    logger.info("\nGenerated files:")
    for i, file in enumerate(generated_files, 1):
        file_size_kb = file.stat().st_size / 1024
        logger.info(f"  {i:2d}. {file.name:45s} ({file_size_kb:8.1f} KB)")

    logger.info("=" * 80)


if __name__ == "__main__":
    main()
