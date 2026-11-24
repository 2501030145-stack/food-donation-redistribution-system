-- Food Donation & Redistribution System
-- MySQL 8.0.16+ / InnoDB. Eight core project entities are preserved.
CREATE DATABASE IF NOT EXISTS food_donation CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE food_donation;

CREATE TABLE IF NOT EXISTS Donor (
 Donor_ID INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(120) NOT NULL,
 Donor_Type ENUM('Individual','Restaurant','Event Organiser') NOT NULL,
 Phone VARCHAR(20) NOT NULL UNIQUE, Email VARCHAR(160) UNIQUE,
 Address VARCHAR(255), City VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Food_Category (
 Category_ID INT AUTO_INCREMENT PRIMARY KEY, Category_Name VARCHAR(80) NOT NULL UNIQUE,
 Is_Perishable BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS NGO (
 NGO_ID INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(150) NOT NULL,
 Reg_No VARCHAR(80) NOT NULL UNIQUE, Phone VARCHAR(20) NOT NULL,
 Email VARCHAR(160), City VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Volunteer (
 Volunteer_ID INT AUTO_INCREMENT PRIMARY KEY, NGO_ID INT NOT NULL,
 Name VARCHAR(120) NOT NULL, Phone VARCHAR(20) NOT NULL UNIQUE,
 Vehicle_Type ENUM('None','Bike','Car','Van') NOT NULL DEFAULT 'None',
 CONSTRAINT fk_vol_ngo FOREIGN KEY (NGO_ID) REFERENCES NGO(NGO_ID)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Recipient (
 Recipient_ID INT AUTO_INCREMENT PRIMARY KEY, NGO_ID INT NOT NULL,
 Name VARCHAR(120) NOT NULL, Family_Size INT NOT NULL DEFAULT 1,
 Phone VARCHAR(20), Address VARCHAR(255), Is_Verified BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT fk_rec_ngo FOREIGN KEY (NGO_ID) REFERENCES NGO(NGO_ID),
 CONSTRAINT chk_family_size CHECK (Family_Size > 0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Food_Donation (
 Donation_ID INT AUTO_INCREMENT PRIMARY KEY, Donor_ID INT NOT NULL, Category_ID INT NOT NULL,
 Food_Item VARCHAR(150) NOT NULL, Quantity DECIMAL(10,2) NOT NULL, Unit VARCHAR(30) NOT NULL,
 Donation_Date DATE NOT NULL, Expiry_Date DATE NOT NULL,
 Status ENUM('Available','Collected','Distributed','Expired') NOT NULL DEFAULT 'Available',
 CONSTRAINT fk_don_donor FOREIGN KEY (Donor_ID) REFERENCES Donor(Donor_ID),
 CONSTRAINT fk_don_category FOREIGN KEY (Category_ID) REFERENCES Food_Category(Category_ID),
 CONSTRAINT chk_donation_quantity CHECK (Quantity > 0),
 CONSTRAINT chk_expiry_date CHECK (Expiry_Date >= Donation_Date),
 INDEX idx_donation_status_expiry (Status,Expiry_Date), INDEX idx_donation_category (Category_ID)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Pickup_Delivery (
 Pickup_ID INT AUTO_INCREMENT PRIMARY KEY, Donation_ID INT NOT NULL UNIQUE,
 Volunteer_ID INT NOT NULL, Pickup_Time DATETIME NOT NULL, Delivery_Time DATETIME NULL,
 CONSTRAINT fk_pick_donation FOREIGN KEY (Donation_ID) REFERENCES Food_Donation(Donation_ID),
 CONSTRAINT fk_pick_volunteer FOREIGN KEY (Volunteer_ID) REFERENCES Volunteer(Volunteer_ID),
 CONSTRAINT chk_delivery_time CHECK (Delivery_Time IS NULL OR Delivery_Time >= Pickup_Time)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS Distribution (
 Distribution_ID INT AUTO_INCREMENT PRIMARY KEY, Pickup_ID INT NOT NULL,
 Recipient_ID INT NOT NULL, Quantity_Distributed DECIMAL(10,2) NOT NULL,
 Distribution_Date DATE NOT NULL,
 CONSTRAINT fk_dist_pickup FOREIGN KEY (Pickup_ID) REFERENCES Pickup_Delivery(Pickup_ID),
 CONSTRAINT fk_dist_recipient FOREIGN KEY (Recipient_ID) REFERENCES Recipient(Recipient_ID),
 CONSTRAINT chk_distribution_quantity CHECK (Quantity_Distributed > 0),
 INDEX idx_distribution_pickup (Pickup_ID)
) ENGINE=InnoDB;

-- Application access table; intentionally separate from the eight academic entities.
CREATE TABLE IF NOT EXISTS App_User (
 User_ID INT AUTO_INCREMENT PRIMARY KEY, Name VARCHAR(120) NOT NULL,
 Email VARCHAR(160) NOT NULL UNIQUE, Password_Hash VARCHAR(255) NOT NULL,
 Role ENUM('Donor','NGO','Volunteer','Admin') NOT NULL,
 Profile_ID INT NULL, Is_Active BOOLEAN NOT NULL DEFAULT TRUE,
 Created_At TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

DROP TRIGGER IF EXISTS trg_pickup_before;
DROP TRIGGER IF EXISTS trg_pickup_after;
DROP TRIGGER IF EXISTS trg_dist_before;
DROP TRIGGER IF EXISTS trg_dist_after;
DROP PROCEDURE IF EXISTS sp_mark_expired;
DELIMITER $$
CREATE TRIGGER trg_pickup_before BEFORE INSERT ON Pickup_Delivery FOR EACH ROW
BEGIN
 DECLARE v_status VARCHAR(20); DECLARE v_expiry DATE;
 SELECT Status,Expiry_Date INTO v_status,v_expiry FROM Food_Donation WHERE Donation_ID=NEW.Donation_ID FOR UPDATE;
 IF v_status <> 'Available' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Donation is not available for pickup'; END IF;
 IF DATE(NEW.Pickup_Time) > v_expiry THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Donation has expired; cannot be collected'; END IF;
END$$
CREATE TRIGGER trg_pickup_after AFTER INSERT ON Pickup_Delivery FOR EACH ROW
BEGIN UPDATE Food_Donation SET Status='Collected' WHERE Donation_ID=NEW.Donation_ID; END$$
CREATE TRIGGER trg_dist_before BEFORE INSERT ON Distribution FOR EACH ROW
BEGIN
 DECLARE v_expiry DATE; DECLARE v_total DECIMAL(12,2); DECLARE v_quantity DECIMAL(12,2); DECLARE v_verified BOOLEAN;
 SELECT fd.Expiry_Date,fd.Quantity INTO v_expiry,v_quantity FROM Pickup_Delivery pd JOIN Food_Donation fd ON fd.Donation_ID=pd.Donation_ID WHERE pd.Pickup_ID=NEW.Pickup_ID;
 SELECT Is_Verified INTO v_verified FROM Recipient WHERE Recipient_ID=NEW.Recipient_ID;
 SELECT COALESCE(SUM(Quantity_Distributed),0) INTO v_total FROM Distribution WHERE Pickup_ID=NEW.Pickup_ID;
 IF NEW.Distribution_Date > v_expiry THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot distribute expired food'; END IF;
 IF v_verified = FALSE THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Recipient is not verified'; END IF;
 IF v_total + NEW.Quantity_Distributed > v_quantity THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Distribution exceeds donated quantity'; END IF;
END$$
CREATE TRIGGER trg_dist_after AFTER INSERT ON Distribution FOR EACH ROW
BEGIN
 UPDATE Food_Donation fd JOIN Pickup_Delivery pd ON pd.Donation_ID=fd.Donation_ID
 SET fd.Status='Distributed'
 WHERE pd.Pickup_ID=NEW.Pickup_ID AND
 (SELECT COALESCE(SUM(d.Quantity_Distributed),0) FROM Distribution d WHERE d.Pickup_ID=NEW.Pickup_ID) >= fd.Quantity;
END$$
CREATE PROCEDURE sp_mark_expired()
BEGIN
 UPDATE Food_Donation SET Status='Expired'
 WHERE Expiry_Date < CURRENT_DATE() AND Status IN ('Available','Collected');
 SELECT ROW_COUNT() AS rows_expired;
END$$
DELIMITER ;

-- Academic query views / demonstration layer.
CREATE OR REPLACE VIEW vw_available_donations AS
 SELECT d.Donation_ID,d.Food_Item,d.Quantity,d.Unit,d.Expiry_Date,fc.Category_Name,don.Name AS Donor_Name,don.City
 FROM Food_Donation d JOIN Food_Category fc ON fc.Category_ID=d.Category_ID JOIN Donor don ON don.Donor_ID=d.Donor_ID
 WHERE d.Status='Available' AND d.Expiry_Date >= CURRENT_DATE();
CREATE OR REPLACE VIEW vw_donation_trace AS
 SELECT fd.Donation_ID,fd.Food_Item,fd.Quantity,fd.Unit,fd.Status,don.Name AS Donor_Name,
 pd.Pickup_ID,pd.Pickup_Time,pd.Delivery_Time,v.Name AS Volunteer_Name,
 dist.Distribution_ID,dist.Quantity_Distributed,dist.Distribution_Date,r.Name AS Recipient_Name
 FROM Food_Donation fd JOIN Donor don ON don.Donor_ID=fd.Donor_ID
 LEFT JOIN Pickup_Delivery pd ON pd.Donation_ID=fd.Donation_ID
 LEFT JOIN Volunteer v ON v.Volunteer_ID=pd.Volunteer_ID
 LEFT JOIN Distribution dist ON dist.Pickup_ID=pd.Pickup_ID
 LEFT JOIN Recipient r ON r.Recipient_ID=dist.Recipient_ID;

INSERT IGNORE INTO Food_Category(Category_Name,Is_Perishable) VALUES
 ('Cooked Food',TRUE),('Packaged Food',FALSE),('Fresh Produce',TRUE),('Bakery',TRUE),('Dairy',TRUE);

-- Core schema installs category reference data only. Operational records are created
-- through the application; no fictional impact statistics are preloaded.
